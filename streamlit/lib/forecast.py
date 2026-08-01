"""Topeka seasonal next-mow forecasting (ported from Next.js)."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any


def get_season(dt: datetime | None = None) -> str:
    dt = dt or datetime.now()
    month, day = dt.month, dt.day
    if 3 <= month <= 5:
        return "spring"
    if month == 6 or (month == 7 and day < 15):
        return "early_summer"
    if (month == 7 and day >= 15) or month in (8, 9):
        return "late_summer"
    return "off_season"


def base_interval(season: str) -> int:
    return {
        "spring": 6,
        "early_summer": 7,
        "late_summer": 11,
        "off_season": 14,
    }[season]


def estimate_minutes(size: str) -> int:
    return {"small": 35, "medium": 50, "large": 75, "xlarge": 100}.get(size, 50)


def recent_precip_inches(days: list[dict[str, Any]], lookback: int) -> float:
    total = 0.0
    for d in days[:lookback]:
        for p in d.get("periods", []):
            total += float(p.get("precip_inches") or 0)
    return total


def forecast_lawn(
    lawn: dict[str, Any],
    last_mowed_at: str | None,
    weather: list[dict[str, Any]],
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now()
    season = get_season(now)
    has_custom = lawn.get("interval_days") is not None
    interval = int(lawn["interval_days"]) if has_custom else base_interval(season)

    precip7 = recent_precip_inches(weather, 7)
    precip1 = recent_precip_inches(weather[:1], 1)
    night = 0.0
    morning = 0.0
    if weather:
        for p in weather[0].get("periods", []):
            if p["label"] == "night":
                night = float(p.get("precip_inches") or 0)
            if p["label"] == "morning":
                morning = float(p.get("precip_inches") or 0)

    reasons: list[str] = []
    if has_custom:
        reasons.append(f"Custom interval — every {interval} days")
    else:
        reasons.append(
            {
                "spring": "Spring growth — aim ~every 6 days",
                "early_summer": "Early summer — ~every 7 days",
                "late_summer": "Late summer — stretch when dry",
                "off_season": "Off-season — longer gaps OK",
            }[season]
        )

    if precip7 >= 1.5:
        interval = max(4, interval - 2)
        reasons.append(f'Wet week ({precip7:.1f}" rain) — mow sooner')
    elif precip7 >= 0.75:
        interval = max(5, interval - 1)
        reasons.append(f'Some rain this week ({precip7:.1f}")')
    elif not has_custom and season == "late_summer" and precip7 < 0.25:
        interval = min(12, max(interval, 10))
        reasons.append("Dry stretch — can wait 10–12 days")

    rain_delay = 0
    soak = max(precip1, night + morning)
    if precip1 >= 0.5 or (night + morning) >= 0.4:
        rain_delay = 1
        reasons.append(f'Recent rain (~{soak:.1f}") — wait ~24h for mud')

    if weather and weather[0].get("severe_flag"):
        rain_delay = max(rain_delay, 1)
        reasons.append("Severe weather risk — skip outdoor work")

    days_since = None
    if last_mowed_at:
        last = datetime.fromisoformat(last_mowed_at.replace("Z", "+00:00")).replace(
            tzinfo=None
        )
        days_since = (now - last).days
        next_due = last + timedelta(days=interval + rain_delay)
    else:
        next_due = now
        reasons.append(
            "One-time job — not yet completed"
            if lawn.get("schedule_type") == "adhoc"
            else "No mow history yet — treat as due"
        )

    if rain_delay > 0 and next_due <= now:
        next_due = now + timedelta(days=rain_delay)

    due_status = _due_status(next_due, now, days_since, interval, rain_delay)

    return {
        "lawn_id": lawn["id"],
        "last_mowed_at": last_mowed_at,
        "days_since_mow": days_since,
        "recommended_interval_days": interval,
        "next_due_date": next_due.strftime("%Y-%m-%d"),
        "due_status": due_status,
        "reason": ". ".join(reasons) + ".",
        "rain_delay_days": rain_delay,
    }


def _due_status(
    next_due: datetime,
    now: datetime,
    days_since: int | None,
    interval: int,
    rain_delay: int,
) -> str:
    start_today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    due_day = next_due.replace(hour=0, minute=0, second=0, microsecond=0)
    if rain_delay > 0 and due_day > start_today:
        return "skip_rain"
    diff = (due_day - start_today).days
    if diff < 0:
        return "overdue"
    if diff == 0:
        return "due"
    if diff == 1:
        return "due_soon"
    if days_since is not None and days_since >= interval:
        return "due"
    return "ok"
