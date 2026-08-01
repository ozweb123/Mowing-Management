"""
Build an Apple/Google-friendly .ics calendar from the week mowing plan.
Used for download + (via Next.js) subscribe feeds.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from lib.capacity import get_capacity_settings
from lib.mowers import mower_label
from lib.services import build_week

TZ = ZoneInfo("America/Chicago")


def _escape(text: str) -> str:
    return (
        (text or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _fold(line: str) -> str:
    """RFC 5545 line folding at 75 octets (approx chars here)."""
    if len(line) <= 75:
        return line
    parts = [line[:75]]
    rest = line[75:]
    while rest:
        parts.append(" " + rest[:74])
        rest = rest[74:]
    return "\r\n".join(parts)


def event_uid(lawn_id: str, date_str: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9-]", "", lawn_id)
    return f"mmm-{safe}-{date_str}@milesmowing.local"


def build_calendar_events(days_count: int = 14) -> list[dict[str, Any]]:
    """Flatten week planner days into calendar event dicts."""
    view = build_week(min(days_count, 10))
    cap = get_capacity_settings()
    start_hour = int(cap["available_start_hour"])

    events: list[dict[str, Any]] = []
    for day in view["days"]:
        cursor_hour = start_hour
        for job in day["jobs"]:
            lawn = job["lawn"]
            minutes = int(job["estimated_minutes"])
            start = datetime.strptime(day["date"], "%Y-%m-%d").replace(
                hour=cursor_hour, minute=0, second=0, tzinfo=TZ
            )
            end = start + timedelta(minutes=max(30, minutes))
            # Stack jobs sequentially in the day window
            cursor_hour = end.hour + (1 if end.minute else 0)
            if cursor_hour >= 22:
                cursor_hour = start_hour

            events.append(
                {
                    "uid": event_uid(lawn["id"], day["date"]),
                    "summary": f"Mow {lawn['name']} — {mower_label(lawn.get('mower'))}",
                    "location": f"{lawn.get('address') or ''}, {lawn.get('city') or 'Topeka, KS'}".strip(
                        ", "
                    ),
                    "description": "\n".join(
                        [
                            job.get("fit_note") or "",
                            lawn.get("notes") or "",
                            f"Charge: ${lawn['charge_cents']/100:.2f}",
                            f"Mower: {mower_label(lawn.get('mower'))}",
                            f"Dog: {lawn.get('dog_warning') or 'none'}",
                        ]
                    ).strip(),
                    "dtstart": start,
                    "dtend": end,
                    "date": day["date"],
                    "lawn_id": lawn["id"],
                }
            )
    return events


def build_ics(days_count: int = 14, calendar_name: str = "Miles Mowing") -> str:
    """Return a full VCALENDAR document as a string."""
    now = datetime.now(tz=TZ).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Miles Mowing Management//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_escape(calendar_name)}",
        "X-WR-TIMEZONE:America/Chicago",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "X-PUBLISHED-TTL:PT6H",
    ]

    for ev in build_calendar_events(days_count):
        dt_start = ev["dtstart"].strftime("%Y%m%dT%H%M%S")
        dt_end = ev["dtend"].strftime("%Y%m%dT%H%M%S")
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{ev['uid']}",
                f"DTSTAMP:{now}",
                f"DTSTART;TZID=America/Chicago:{dt_start}",
                f"DTEND;TZID=America/Chicago:{dt_end}",
                f"SUMMARY:{_escape(ev['summary'])}",
                f"LOCATION:{_escape(ev['location'])}",
                f"DESCRIPTION:{_escape(ev['description'])}",
                "STATUS:CONFIRMED",
                "TRANSP:OPAQUE",
                "END:VEVENT",
            ]
        )

    lines.append("END:VCALENDAR")
    return "\r\n".join(_fold(line) for line in lines) + "\r\n"
