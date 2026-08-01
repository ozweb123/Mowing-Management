"""
Push / update Miles' schedule into an iCloud calendar via CalDAV.

Requires an Apple ID + app-specific password (not the normal login password):
https://appleid.apple.com → Sign-In and Security → App-Specific Passwords

Auto-sync: schedule mutations mark the calendar dirty and schedule a
background push (~10s debounce). Page loads also drain any leftover dirty
state as a backup.
"""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from lib.calendar_ics import build_calendar_events
from lib.db import get_conn

log = logging.getLogger("miles.calendar")

TZ = ZoneInfo("America/Chicago")
CAL_NAME = "Miles Mowing"
# Coalesce rapid taps (Done on several yards) into one CalDAV push.
BG_DEBOUNCE_SEC = 10
# Page-load backup: don't re-hit iCloud if we just synced.
PAGE_DEBOUNCE_SEC = 20

_timer_lock = threading.Lock()
_sync_lock = threading.Lock()
_pending_timer: threading.Timer | None = None


def _secrets() -> tuple[str | None, str | None]:
    try:
        import streamlit as st

        email = st.secrets.get("icloud_apple_id") or st.secrets.get("icloud_email")
        password = st.secrets.get("icloud_app_password")
        return (
            str(email).strip() if email else None,
            str(password).strip() if password else None,
        )
    except Exception:
        return None, None


def caldav_configured() -> bool:
    email, password = _secrets()
    return bool(email and password)


def ensure_calendar_sync_columns() -> None:
    conn = get_conn()
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(settings)").fetchall()}
    if "calendar_auto_sync" not in cols:
        conn.execute(
            "ALTER TABLE settings ADD COLUMN calendar_auto_sync INTEGER NOT NULL DEFAULT 1"
        )
    if "calendar_dirty" not in cols:
        conn.execute(
            "ALTER TABLE settings ADD COLUMN calendar_dirty INTEGER NOT NULL DEFAULT 0"
        )
    if "calendar_last_sync_at" not in cols:
        conn.execute("ALTER TABLE settings ADD COLUMN calendar_last_sync_at TEXT")
    if "calendar_last_sync_error" not in cols:
        conn.execute("ALTER TABLE settings ADD COLUMN calendar_last_sync_error TEXT")
    conn.commit()


def get_calendar_sync_state() -> dict[str, Any]:
    ensure_calendar_sync_columns()
    row = get_conn().execute(
        """
        SELECT calendar_auto_sync, calendar_dirty, calendar_last_sync_at,
               calendar_last_sync_error
        FROM settings WHERE id = 1
        """
    ).fetchone()
    return {
        "auto_sync": bool(row["calendar_auto_sync"]),
        "dirty": bool(row["calendar_dirty"]),
        "last_sync_at": row["calendar_last_sync_at"],
        "last_error": row["calendar_last_sync_error"],
        "configured": caldav_configured(),
    }


def set_calendar_auto_sync(enabled: bool) -> None:
    ensure_calendar_sync_columns()
    get_conn().execute(
        "UPDATE settings SET calendar_auto_sync = ? WHERE id = 1",
        (1 if enabled else 0,),
    )
    get_conn().commit()
    if enabled:
        mark_calendar_dirty()


def mark_calendar_dirty() -> None:
    """Call after any schedule change (plan pin, rain push, Done, lawn edits…)."""
    ensure_calendar_sync_columns()
    get_conn().execute(
        "UPDATE settings SET calendar_dirty = 1 WHERE id = 1"
    )
    get_conn().commit()
    schedule_background_sync()


def background_sync_pending() -> bool:
    """True while a debounced background sync timer is still waiting."""
    with _timer_lock:
        return _pending_timer is not None and _pending_timer.is_alive()


def schedule_background_sync() -> None:
    """
    After a short quiet period, push to iCloud in a daemon thread.
    Safe to call repeatedly — timers coalesce.
    """
    state = get_calendar_sync_state()
    if not state["configured"] or not state["auto_sync"] or not state["dirty"]:
        return

    # Capture secrets on the Streamlit/request thread (not inside the worker).
    email, password = _secrets()
    if not email or not password:
        return

    global _pending_timer
    with _timer_lock:
        if _pending_timer is not None:
            try:
                _pending_timer.cancel()
            except Exception:
                pass
        timer = threading.Timer(
            BG_DEBOUNCE_SEC,
            _background_sync_worker,
            args=(email, password),
        )
        timer.daemon = True
        _pending_timer = timer
        timer.start()
    log.info("Scheduled iCloud calendar sync in %ss", BG_DEBOUNCE_SEC)


def _background_sync_worker(email: str, password: str) -> None:
    try:
        state = get_calendar_sync_state()
        if not state["auto_sync"] or not state["dirty"]:
            return
        sync_schedule_to_icloud(10, email=email, password=password)
        log.info("Background iCloud calendar sync completed")
    except Exception as e:
        log.exception("Background calendar sync failed")
        _set_sync_result(False, str(e)[:500])


def _set_sync_result(ok: bool, error: str | None = None) -> None:
    ensure_calendar_sync_columns()
    get_conn().execute(
        """
        UPDATE settings SET
          calendar_dirty = ?,
          calendar_last_sync_at = ?,
          calendar_last_sync_error = ?
        WHERE id = 1
        """,
        (
            0 if ok else 1,
            datetime.now(tz=TZ).isoformat(),
            error,
        ),
    )
    get_conn().commit()


def sync_schedule_to_icloud(
    days_count: int = 10,
    *,
    email: str | None = None,
    password: str | None = None,
) -> dict[str, Any]:
    """
    Upsert this week's (and upcoming) mow jobs into iCloud calendar "Miles Mowing".
    Returns counts: created, updated, deleted, total.
    """
    try:
        from caldav import DAVClient
    except ImportError as e:
        raise RuntimeError(
            "caldav package missing. Add caldav to requirements and redeploy."
        ) from e

    if not email or not password:
        email, password = _secrets()
    if not email or not password:
        raise RuntimeError(
            "Add icloud_apple_id and icloud_app_password to Streamlit secrets."
        )

    with _sync_lock:
        return _sync_schedule_locked(days_count, email, password)


def _sync_schedule_locked(
    days_count: int, email: str, password: str
) -> dict[str, Any]:
    from caldav import DAVClient

    events = build_calendar_events(days_count)
    wanted_uids = {e["uid"] for e in events}

    client = DAVClient(
        url="https://caldav.icloud.com/",
        username=email,
        password=password,
    )
    principal = client.principal()
    calendars = principal.calendars()

    target = None
    for cal in calendars:
        try:
            name = cal.name or ""
        except Exception:
            name = ""
        if name.strip().lower() == CAL_NAME.lower():
            target = cal
            break
    if target is None:
        target = principal.make_calendar(name=CAL_NAME)

    existing: dict[str, Any] = {}
    try:
        for ev in target.events():
            try:
                ical = ev.icalendar_instance
                for component in ical.walk("VEVENT"):
                    uid = str(component.get("uid"))
                    if uid.startswith("mmm-") and uid.endswith("@milesmowing.local"):
                        existing[uid] = ev
            except Exception:
                continue
    except Exception:
        existing = {}

    created = updated = 0
    for data in events:
        uid = data["uid"]
        ics_body = _vevent_ics(data)
        if uid in existing:
            existing[uid].data = ics_body
            try:
                existing[uid].save()
            except Exception:
                try:
                    existing[uid].delete()
                except Exception:
                    pass
                target.save_event(ics_body)
            updated += 1
        else:
            target.save_event(ics_body)
            created += 1

    deleted = 0
    for uid, ev in existing.items():
        if uid not in wanted_uids:
            try:
                ev.delete()
                deleted += 1
            except Exception:
                pass

    result = {
        "created": created,
        "updated": updated,
        "deleted": deleted,
        "total": len(events),
        "calendar": CAL_NAME,
    }
    _set_sync_result(True, None)
    return result


def maybe_auto_sync(
    *,
    force: bool = False,
    debounce: bool = True,
) -> dict[str, Any] | None:
    """
    If auto-sync is on, iCloud is configured, and the schedule is dirty
    (or force=True), push to iCloud. Returns sync result or None if skipped.
    """
    state = get_calendar_sync_state()
    if not state["configured"]:
        return None
    if not force and not state["auto_sync"]:
        return None
    if not force and not state["dirty"]:
        return None

    if debounce and not force and state["last_sync_at"]:
        try:
            last = datetime.fromisoformat(state["last_sync_at"])
            if last.tzinfo is None:
                last = last.replace(tzinfo=TZ)
            if datetime.now(tz=TZ) - last < timedelta(seconds=PAGE_DEBOUNCE_SEC):
                return None
        except Exception:
            pass

    try:
        return sync_schedule_to_icloud(10)
    except Exception as e:
        log.exception("Auto calendar sync failed")
        _set_sync_result(False, str(e)[:500])
        return {"error": str(e)}


def _vevent_ics(ev: dict[str, Any]) -> str:
    def esc(t: str) -> str:
        return (
            (t or "")
            .replace("\\", "\\\\")
            .replace(";", "\\;")
            .replace(",", "\\,")
            .replace("\n", "\\n")
        )

    now = datetime.now(tz=TZ).strftime("%Y%m%dT%H%M%SZ")
    dt_start = ev["dtstart"].strftime("%Y%m%dT%H%M%S")
    dt_end = ev["dtend"].strftime("%Y%m%dT%H%M%S")
    return "\r\n".join(
        [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Miles Mowing Management//EN",
            "BEGIN:VEVENT",
            f"UID:{ev['uid']}",
            f"DTSTAMP:{now}",
            f"DTSTART;TZID=America/Chicago:{dt_start}",
            f"DTEND;TZID=America/Chicago:{dt_end}",
            f"SUMMARY:{esc(ev['summary'])}",
            f"LOCATION:{esc(ev['location'])}",
            f"DESCRIPTION:{esc(ev['description'])}",
            "STATUS:CONFIRMED",
            "END:VEVENT",
            "END:VCALENDAR",
            "",
        ]
    )
