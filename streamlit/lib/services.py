"""Lawn / mowing / money / week service layer."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from typing import Any

from lib.capacity import available_minutes_for_date, capacity_snapshot, get_capacity_settings
from lib.db import dollars, get_conn, row_to_dict
from lib.forecast import estimate_minutes, forecast_lawn, get_season
from lib.weather import fetch_weather


def list_lawns(include_inactive: bool = False) -> list[dict[str, Any]]:
    q = "SELECT * FROM lawns"
    if not include_inactive:
        q += " WHERE active = 1"
    q += " ORDER BY route_order ASC, name ASC"
    return [dict(r) for r in get_conn().execute(q).fetchall()]


def get_lawn(lawn_id: str) -> dict[str, Any] | None:
    return row_to_dict(
        get_conn().execute("SELECT * FROM lawns WHERE id = ?", (lawn_id,)).fetchone()
    )


def create_lawn(data: dict[str, Any]) -> dict[str, Any]:
    from lib.mowers import DEFAULT_MOWER, MOWER_OPTIONS

    now = datetime.utcnow().isoformat() + "Z"
    lid = str(uuid.uuid4())
    mower = data.get("mower") or DEFAULT_MOWER
    if mower not in MOWER_OPTIONS:
        mower = DEFAULT_MOWER
    get_conn().execute(
        """
        INSERT INTO lawns (
          id, name, address, city, notes, charge_cents, size, schedule_type,
          interval_days, route_order, dog_warning, gate_code, phone, mower, active,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        """,
        (
            lid,
            data["name"],
            data.get("address", ""),
            data.get("city", "Topeka, KS"),
            data.get("notes", ""),
            int(round(float(data["charge_dollars"]) * 100)),
            data.get("size", "medium"),
            data.get("schedule_type", "recurring"),
            data.get("interval_days"),
            int(data.get("route_order", 100)),
            data.get("dog_warning", "none"),
            data.get("gate_code", ""),
            data.get("phone", ""),
            mower,
            now,
            now,
        ),
    )
    get_conn().commit()
    _notify_calendar()
    return get_lawn(lid)  # type: ignore[return-value]


def _notify_calendar() -> None:
    """Mark iCloud calendar dirty so auto-sync picks up schedule changes."""
    try:
        from lib.calendar_sync import mark_calendar_dirty

        mark_calendar_dirty()
    except Exception:
        pass


def update_lawn(lawn_id: str, **fields: Any) -> dict[str, Any] | None:
    from lib.mowers import MOWER_OPTIONS

    lawn = get_lawn(lawn_id)
    if not lawn:
        return None
    if "mower" in fields and fields["mower"] not in MOWER_OPTIONS:
        fields = {**fields, "mower": lawn.get("mower")}
    mapping = {
        "name": "name",
        "address": "address",
        "notes": "notes",
        "size": "size",
        "schedule_type": "schedule_type",
        "dog_warning": "dog_warning",
        "gate_code": "gate_code",
        "phone": "phone",
        "mower": "mower",
        "route_order": "route_order",
        "planned_mow_date": "planned_mow_date",
    }
    sets = []
    vals: list[Any] = []
    for k, col in mapping.items():
        if k in fields:
            sets.append(f"{col} = ?")
            vals.append(fields[k])
    if "charge_dollars" in fields:
        sets.append("charge_cents = ?")
        vals.append(int(round(float(fields["charge_dollars"]) * 100)))
    if "active" in fields:
        sets.append("active = ?")
        vals.append(1 if fields["active"] else 0)
    sets.append("updated_at = ?")
    vals.append(datetime.utcnow().isoformat() + "Z")
    vals.append(lawn_id)
    get_conn().execute(f"UPDATE lawns SET {', '.join(sets)} WHERE id = ?", vals)
    get_conn().commit()
    # Schedule-relevant field changes should refresh the calendar.
    if any(
        k in fields
        for k in (
            "name",
            "address",
            "mower",
            "planned_mow_date",
            "active",
            "route_order",
            "charge_dollars",
            "notes",
        )
    ):
        _notify_calendar()
    return get_lawn(lawn_id)


def deactivate_lawn(lawn_id: str) -> None:
    update_lawn(lawn_id, active=False)


def delete_lawn_forever(lawn_id: str) -> None:
    """Hard delete lawn + cascading mow history. Gone for good."""
    if not get_lawn(lawn_id):
        raise ValueError("Lawn not found")
    conn = get_conn()
    conn.execute("DELETE FROM mowings WHERE lawn_id = ?", (lawn_id,))
    conn.execute("DELETE FROM lawns WHERE id = ?", (lawn_id,))
    conn.commit()
    _notify_calendar()


def reorder_lawns(ordered_ids: list[str]) -> None:
    now = datetime.utcnow().isoformat() + "Z"
    conn = get_conn()
    for idx, lid in enumerate(ordered_ids):
        conn.execute(
            "UPDATE lawns SET route_order = ?, updated_at = ? WHERE id = ?",
            ((idx + 1) * 10, now, lid),
        )
    conn.commit()
    _notify_calendar()


def last_mowed_at(lawn_id: str) -> str | None:
    row = get_conn().execute(
        """
        SELECT mowed_at FROM mowings WHERE lawn_id = ?
        ORDER BY mowed_at DESC LIMIT 1
        """,
        (lawn_id,),
    ).fetchone()
    return row["mowed_at"] if row else None


def create_mowing(
    lawn_id: str, payment_status: str = "owes", notes: str = ""
) -> dict[str, Any]:
    lawn = get_lawn(lawn_id)
    if not lawn:
        raise ValueError("Lawn not found")
    now = datetime.utcnow().isoformat() + "Z"
    mid = str(uuid.uuid4())
    paid_at = now if payment_status == "paid" else None
    get_conn().execute(
        """
        INSERT INTO mowings (
          id, lawn_id, mowed_at, duration_minutes, notes, weather_summary,
          amount_cents, payment_status, paid_at, created_at
        ) VALUES (?, ?, ?, NULL, ?, '', ?, ?, ?, ?)
        """,
        (
            mid,
            lawn_id,
            now,
            notes,
            lawn["charge_cents"],
            payment_status,
            paid_at,
            now,
        ),
    )
    get_conn().execute(
        "UPDATE lawns SET planned_mow_date = NULL, updated_at = ? WHERE id = ?",
        (now, lawn_id),
    )
    get_conn().commit()
    _notify_calendar()
    return dict(
        get_conn().execute("SELECT * FROM mowings WHERE id = ?", (mid,)).fetchone()
    )


def update_payment(mowing_id: str, status: str) -> None:
    paid_at = datetime.utcnow().isoformat() + "Z" if status == "paid" else None
    get_conn().execute(
        "UPDATE mowings SET payment_status = ?, paid_at = ? WHERE id = ?",
        (status, paid_at, mowing_id),
    )
    get_conn().commit()


def list_mowings(limit: int = 100, lawn_id: str | None = None) -> list[dict[str, Any]]:
    if lawn_id:
        rows = get_conn().execute(
            """
            SELECT * FROM mowings WHERE lawn_id = ?
            ORDER BY mowed_at DESC LIMIT ?
            """,
            (lawn_id, limit),
        ).fetchall()
    else:
        rows = get_conn().execute(
            "SELECT * FROM mowings ORDER BY mowed_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_settings() -> dict[str, Any]:
    return dict(get_conn().execute("SELECT * FROM settings WHERE id = 1").fetchone())


def ensure_calendar_token() -> str:
    """Stable secret token for calendar subscribe links."""
    import secrets as pysecrets

    row = get_conn().execute(
        "SELECT calendar_token FROM settings WHERE id = 1"
    ).fetchone()
    token = row["calendar_token"] if row else None
    if not token:
        token = pysecrets.token_urlsafe(24)
        get_conn().execute(
            "UPDATE settings SET calendar_token = ? WHERE id = 1", (token,)
        )
        get_conn().commit()
    return token


def rotate_calendar_token() -> str:
    import secrets as pysecrets

    token = pysecrets.token_urlsafe(24)
    get_conn().execute(
        "UPDATE settings SET calendar_token = ? WHERE id = 1", (token,)
    )
    get_conn().commit()
    return token


def update_settings(**kwargs: Any) -> None:
    allowed = {
        "owner_name",
        "savings_goal_cents",
        "savings_label",
        "gas_estimate_per_yard_cents",
    }
    sets = []
    vals: list[Any] = []
    for k, v in kwargs.items():
        if k in allowed:
            sets.append(f"{k} = ?")
            vals.append(v)
    if sets:
        get_conn().execute(f"UPDATE settings SET {', '.join(sets)} WHERE id = 1", vals)
        get_conn().commit()


def rain_push(days: int = 1) -> str:
    until = datetime.now() + timedelta(days=days)
    until = until.replace(hour=23, minute=59, second=59)
    iso = until.isoformat()
    get_conn().execute(
        "UPDATE settings SET rain_push_until = ? WHERE id = 1", (iso,)
    )
    get_conn().commit()
    _notify_calendar()
    return iso


def clear_rain_push() -> None:
    get_conn().execute("UPDATE settings SET rain_push_until = NULL WHERE id = 1")
    get_conn().commit()
    _notify_calendar()


def build_today() -> dict[str, Any]:
    weather = fetch_weather()
    lawns = list_lawns(False)
    settings = get_settings()
    rain_active = False
    if settings.get("rain_push_until"):
        try:
            rain_active = datetime.fromisoformat(settings["rain_push_until"]) > datetime.now()
        except Exception:
            rain_active = False

    jobs = []
    for lawn in lawns:
        fc = forecast_lawn(lawn, last_mowed_at(lawn["id"]), weather)
        if rain_active and fc["due_status"] in ("due", "overdue", "due_soon"):
            fc = {
                **fc,
                "due_status": "skip_rain",
                "rain_delay_days": max(fc["rain_delay_days"], 1),
                "reason": fc["reason"] + " Manual rain-day push active.",
            }
        jobs.append(
            {
                "lawn": lawn,
                "forecast": fc,
                "estimated_minutes": estimate_minutes(lawn["size"]),
            }
        )

    rank = {"overdue": 0, "due": 1, "skip_rain": 2, "due_soon": 3, "ok": 4}
    jobs.sort(
        key=lambda j: (
            0 if j["forecast"]["due_status"] in ("overdue", "due") else 1,
            rank.get(j["forecast"]["due_status"], 9),
            j["lawn"]["route_order"],
        )
    )

    actionable = [
        j
        for j in jobs
        if j["forecast"]["due_status"] in ("due", "overdue", "due_soon")
        or (
            j["lawn"]["schedule_type"] == "adhoc"
            and j["forecast"]["last_mowed_at"] is None
        )
    ]
    display = actionable or jobs[:4]
    scheduled = sum(
        j["estimated_minutes"]
        for j in display
        if j["forecast"]["due_status"] in ("due", "overdue", "due_soon")
        or (
            j["lawn"]["schedule_type"] == "adhoc"
            and j["forecast"]["last_mowed_at"] is None
        )
    )
    est_cents = sum(
        j["lawn"]["charge_cents"]
        for j in display
        if j["forecast"]["due_status"] in ("due", "overdue", "due_soon")
        or (
            j["lawn"]["schedule_type"] == "adhoc"
            and j["forecast"]["last_mowed_at"] is None
        )
    )
    yard_count = sum(
        1
        for j in display
        if j["forecast"]["due_status"] in ("due", "overdue", "due_soon")
        or (
            j["lawn"]["schedule_type"] == "adhoc"
            and j["forecast"]["last_mowed_at"] is None
        )
    )

    return {
        "owner_name": settings["owner_name"],
        "season": get_season(),
        "weather_today": weather[0] if weather else None,
        "jobs": display,
        "summary": {
            "yard_count": yard_count,
            "estimated_cents": est_cents,
            "estimated_minutes": scheduled,
            "gas_estimate_cents": yard_count * settings["gas_estimate_per_yard_cents"],
        },
        "capacity": capacity_snapshot(scheduled),
        "rain_push_until": settings.get("rain_push_until"),
        "dollars": dollars,
    }


def _rain_risk(day: dict[str, Any] | None) -> int:
    if not day:
        return 0
    return max(int(p.get("precip_probability") or 0) for p in day.get("periods", []))


def build_week(days_count: int = 7) -> dict[str, Any]:
    weather = fetch_weather()[:days_count]
    capacity = get_capacity_settings()
    lawns = list_lawns(False)
    today = datetime.now().strftime("%Y-%m-%d")

    pending = []
    for lawn in lawns:
        fc = forecast_lawn(lawn, last_mowed_at(lawn["id"]), fetch_weather())
        planned = lawn.get("planned_mow_date")
        target = planned or fc["next_due_date"]
        if target < today:
            target = today
        last = weather[-1]["date"] if weather else today
        if target > last:
            if fc["due_status"] not in ("overdue", "due", "due_soon") and not planned:
                target = ""
            else:
                target = last
        pending.append(
            {
                "lawn": lawn,
                "forecast": fc,
                "estimated_minutes": estimate_minutes(lawn["size"]),
                "target": target,
            }
        )

    # Simple assignment: use planned or target (suggestions shown separately)
    suggestions = []
    assignment: dict[str, str] = {}
    for p in pending:
        if not p["target"]:
            continue
        planned = p["lawn"].get("planned_mow_date")
        if planned:
            assignment[p["lawn"]["id"]] = planned
            continue
        # Suggest move if wet
        due_day = next((d for d in weather if d["date"] == p["target"]), None)
        risk = _rain_risk(due_day)
        if due_day and (risk >= 45 or due_day.get("severe_flag")):
            for d in weather:
                if d["date"] == p["target"]:
                    continue
                r = _rain_risk(d)
                if d.get("severe_flag") or r >= 55:
                    continue
                dt = datetime.strptime(d["date"], "%Y-%m-%d")
                avail = available_minutes_for_date(dt, capacity)["available_minutes"]
                load = sum(
                    x["estimated_minutes"]
                    for x in pending
                    if assignment.get(x["lawn"]["id"], x["target"]) == d["date"]
                )
                if load + p["estimated_minutes"] <= avail:
                    suggestions.append(
                        {
                            "lawn_id": p["lawn"]["id"],
                            "lawn_name": p["lawn"]["name"],
                            "from_date": p["target"],
                            "to_date": d["date"],
                            "note": f"Better than {p['target'][5:]} — rain {r}% (was {risk}%)",
                        }
                    )
                    assignment[p["lawn"]["id"]] = d["date"]
                    break
            else:
                assignment[p["lawn"]["id"]] = p["target"]
        else:
            assignment[p["lawn"]["id"]] = p["target"]

    week_days = []
    for w in weather:
        dt = datetime.strptime(w["date"], "%Y-%m-%d")
        cap = available_minutes_for_date(dt, capacity)
        day_jobs = []
        for p in pending:
            if assignment.get(p["lawn"]["id"]) != w["date"]:
                continue
            risk = _rain_risk(w)
            if w.get("severe_flag") or risk >= 60:
                fit, note = "risky", f"Rain {risk}% — washout risk"
            elif risk >= 35:
                fit, note = "ok", f"Some rain risk ({risk}%)"
            else:
                fit, note = "good", f"Dry window · rain {risk}%"
            if p["lawn"].get("planned_mow_date"):
                note = f"Pinned by you · {note}"
            day_jobs.append(
                {
                    **p,
                    "fit": fit,
                    "fit_note": note,
                    "planned_date": w["date"],
                }
            )
        day_jobs.sort(key=lambda j: j["lawn"]["route_order"])
        sched = sum(j["estimated_minutes"] for j in day_jobs)
        tip = None
        if w.get("severe_flag"):
            tip = "Unsafe mowing day — replan."
        elif _rain_risk(w) >= 60:
            tip = "Heavy rain risk — keep this day light."
        elif sched > cap["available_minutes"]:
            tip = "Overbooked vs school/sports blocks — move a yard."
        week_days.append(
            {
                "date": w["date"],
                "weekday": dt.strftime("%a"),
                "is_today": w["date"] == today,
                "weather": w,
                "rain_risk": _rain_risk(w),
                "available_minutes": cap["available_minutes"],
                "scheduled_minutes": sched,
                "overbooked": sched > cap["available_minutes"],
                "blocked_labels": cap["blocked_labels"],
                "jobs": day_jobs,
                "tip": tip,
            }
        )

    return {
        "season": get_season(),
        "days": week_days,
        "suggestions": suggestions,
        "dollars": dollars,
    }


def money_summary() -> dict[str, Any]:
    conn = get_conn()
    settings = get_settings()

    def start_of_day():
        return datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)

    d0 = start_of_day()
    # Sunday-start week
    week0 = d0 - timedelta(days=(d0.weekday() + 1) % 7)
    month0 = d0.replace(day=1)
    season0 = datetime(d0.year if d0.month >= 3 else d0.year - 1, 3, 1)

    def agg(since: datetime) -> dict[str, int]:
        iso = since.isoformat()
        earned = conn.execute(
            "SELECT COALESCE(SUM(amount_cents),0) s FROM mowings WHERE mowed_at >= ?",
            (iso,),
        ).fetchone()["s"]
        paid = conn.execute(
            """
            SELECT COALESCE(SUM(amount_cents),0) s FROM mowings
            WHERE mowed_at >= ? AND payment_status = 'paid'
            """,
            (iso,),
        ).fetchone()["s"]
        expense = conn.execute(
            "SELECT COALESCE(SUM(amount_cents),0) s FROM expenses WHERE spent_at >= ?",
            (iso,),
        ).fetchone()["s"]
        return {
            "earned_cents": earned,
            "paid_cents": paid,
            "expense_cents": expense,
            "profit_cents": paid - expense,
        }

    owes = conn.execute(
        """
        SELECT COALESCE(SUM(amount_cents),0) s FROM mowings
        WHERE payment_status IN ('owes','partial')
        """
    ).fetchone()["s"]
    outstanding = [
        dict(r)
        for r in conn.execute(
            """
            SELECT m.id, m.amount_cents, m.mowed_at, m.payment_status, l.name AS lawn_name
            FROM mowings m JOIN lawns l ON l.id = m.lawn_id
            WHERE m.payment_status IN ('owes','partial')
            ORDER BY m.mowed_at DESC LIMIT 50
            """
        ).fetchall()
    ]
    season = agg(season0)
    return {
        "settings": settings,
        "day": agg(d0),
        "week": agg(week0),
        "month": agg(month0),
        "season": season,
        "owes_cents": owes,
        "saved_toward_goal_cents": max(0, season["profit_cents"]),
        "outstanding": outstanding,
        "expenses": [
            dict(r)
            for r in conn.execute(
                "SELECT * FROM expenses ORDER BY spent_at DESC LIMIT 50"
            ).fetchall()
        ],
        "dollars": dollars,
    }


def add_expense(category: str, amount_dollars: float, note: str = "") -> None:
    now = datetime.utcnow().isoformat() + "Z"
    get_conn().execute(
        """
        INSERT INTO expenses (id, category, amount_cents, note, spent_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            category,
            int(round(amount_dollars * 100)),
            note,
            now,
            now,
        ),
    )
    get_conn().commit()


def set_planned_date(lawn_id: str, date: str | None) -> None:
    update_lawn(lawn_id, planned_mow_date=date)
    # update_lawn already notifies when planned_mow_date is set


def maps_url(address: str, city: str) -> str:
    from urllib.parse import quote

    return f"https://maps.apple.com/?q={quote(f'{address}, {city}')}"


def sms_url(message: str, phone: str = "") -> str:
    from urllib.parse import quote

    digits = "".join(c for c in phone if c.isdigit() or c == "+")
    return f"sms:{digits}?&body={quote(message)}"
