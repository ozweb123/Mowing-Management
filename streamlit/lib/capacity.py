"""School/sports capacity helpers."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from lib.db import get_conn


def get_capacity_settings() -> dict[str, Any]:
    row = get_conn().execute(
        """
        SELECT available_start_hour, available_end_hour, blocked_json
        FROM settings WHERE id = 1
        """
    ).fetchone()
    blocked = []
    try:
        blocked = json.loads(row["blocked_json"] or "[]")
    except Exception:
        blocked = []
    return {
        "available_start_hour": row["available_start_hour"],
        "available_end_hour": row["available_end_hour"],
        "blocked": blocked,
    }


def save_capacity_settings(
    start: int | None = None,
    end: int | None = None,
    blocked: list[dict[str, Any]] | None = None,
) -> None:
    cur = get_capacity_settings()
    start = start if start is not None else cur["available_start_hour"]
    end = end if end is not None else cur["available_end_hour"]
    blocked = blocked if blocked is not None else cur["blocked"]
    if end <= start:
        end = min(22, start + 4)
    get_conn().execute(
        """
        UPDATE settings SET available_start_hour = ?, available_end_hour = ?,
        blocked_json = ? WHERE id = 1
        """,
        (start, end, json.dumps(blocked)),
    )
    get_conn().commit()
    try:
        from lib.calendar_sync import mark_calendar_dirty

        mark_calendar_dirty()
    except Exception:
        pass


def fmt_hour(h: int) -> str:
    ampm = "pm" if h >= 12 else "am"
    hr = 12 if h % 12 == 0 else h % 12
    return f"{hr}{ampm}"


def available_minutes_for_date(
    dt: datetime, settings: dict[str, Any] | None = None
) -> dict[str, Any]:
    settings = settings or get_capacity_settings()
    start = settings["available_start_hour"]
    end = settings["available_end_hour"]
    window = max(0, (end - start) * 60)
    dow = dt.weekday()  # Mon=0…Sun=6 in Python
    # Convert to JS-style Sun=0…Sat=6 used in stored blocks
    js_dow = (dow + 1) % 7

    blocked_mins = 0
    labels: list[str] = []
    for slot in settings["blocked"]:
        if int(slot.get("dow", -1)) != js_dow:
            continue
        o_start = max(start, int(slot["startHour"]))
        o_end = min(end, int(slot["endHour"]))
        if o_end > o_start:
            blocked_mins += (o_end - o_start) * 60
            labels.append(
                f"{slot.get('label', 'Blocked')} ({fmt_hour(int(slot['startHour']))}–{fmt_hour(int(slot['endHour']))})"
            )

    return {
        "available_minutes": max(0, window - blocked_mins),
        "blocked_minutes": blocked_mins,
        "window_minutes": window,
        "blocked_labels": labels,
    }


def capacity_snapshot(scheduled_minutes: int, dt: datetime | None = None) -> dict[str, Any]:
    dt = dt or datetime.now()
    settings = get_capacity_settings()
    day = available_minutes_for_date(dt, settings)
    avail = day["available_minutes"]
    over = scheduled_minutes > avail
    ratio = (
        min(1.5, scheduled_minutes / avail)
        if avail > 0
        else (1.5 if scheduled_minutes else 0)
    )
    return {
        **day,
        "settings": settings,
        "scheduled_minutes": scheduled_minutes,
        "remaining_minutes": avail - scheduled_minutes,
        "overbooked": over,
        "fill_percent": round(min(100, ratio * 100)),
        "work_window_label": f"{fmt_hour(settings['available_start_hour'])}–{fmt_hour(settings['available_end_hour'])}",
    }
