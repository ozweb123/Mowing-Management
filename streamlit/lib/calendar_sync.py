"""
Push / update Miles' schedule into an iCloud calendar via CalDAV.

Requires an Apple ID + app-specific password (not the normal login password):
https://appleid.apple.com → Sign-In and Security → App-Specific Passwords
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from lib.calendar_ics import build_calendar_events, event_uid

TZ = ZoneInfo("America/Chicago")
CAL_NAME = "Miles Mowing"


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


def sync_schedule_to_icloud(days_count: int = 10) -> dict[str, Any]:
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

    email, password = _secrets()
    if not email or not password:
        raise RuntimeError(
            "Add icloud_apple_id and icloud_app_password to Streamlit secrets."
        )

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

    # Index existing Miles events by UID
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
        # Some empty calendars throw on events()
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
                # Fallback: delete + recreate
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

    return {
        "created": created,
        "updated": updated,
        "deleted": deleted,
        "total": len(events),
        "calendar": CAL_NAME,
    }


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
