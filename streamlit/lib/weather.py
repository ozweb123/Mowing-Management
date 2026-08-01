"""Open-Meteo forecast for SW Topeka — Night / Morning / Afternoon periods."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import requests

_CACHE: dict[str, Any] = {"at": 0.0, "data": []}
CACHE_SEC = 15 * 60


def _secret(key: str, default: str) -> str:
    try:
        import streamlit as st

        return str(st.secrets.get(key, default))
    except Exception:
        return default


def _code_summary(code: int | None) -> str:
    if code is None:
        return "—"
    if code == 0:
        return "Clear"
    if code <= 3:
        return "Partly cloudy"
    if code <= 48:
        return "Foggy"
    if code <= 57:
        return "Drizzle"
    if code <= 67:
        return "Rain"
    if code <= 82:
        return "Showers"
    if code >= 95:
        return "Thunderstorms"
    return "Weather"


def _avg(vals: list[float]) -> float | None:
    return sum(vals) / len(vals) if vals else None


def _sum(vals: list[float]) -> float | None:
    return sum(vals) if vals else None


def _max(vals: list[float]) -> float | None:
    return max(vals) if vals else None


def _prev_date(date_str: str) -> str:
    d = datetime.strptime(date_str, "%Y-%m-%d") - timedelta(days=1)
    return d.strftime("%Y-%m-%d")


def _build_period(
    label: str, date_str: str, hourly: dict[str, Any], include_sun_wind: bool
) -> dict[str, Any]:
    times = hourly["time"]
    indices: list[int] = []
    for i, t in enumerate(times):
        d, hm = t.split("T")
        hour = int(hm[:2])
        if label == "morning" and d == date_str and 8 <= hour < 13:
            indices.append(i)
        elif label == "afternoon" and d == date_str and 13 <= hour < 20:
            indices.append(i)
        elif label == "night":
            prev = _prev_date(date_str)
            if (d == prev and hour >= 20) or (d == date_str and hour < 8):
                indices.append(i)

    def pick(key: str) -> list[float]:
        arr = hourly.get(key) or []
        out = []
        for i in indices:
            if i < len(arr) and arr[i] is not None:
                out.append(float(arr[i]))
        return out

    precip_mm = _sum(pick("precipitation")) or 0.0
    period: dict[str, Any] = {
        "label": label,
        "precip_probability": (
            round(_avg(pick("precipitation_probability")))
            if _avg(pick("precipitation_probability")) is not None
            else None
        ),
        "precip_inches": round(precip_mm / 25.4, 2),
        "temp_f": (
            round(_avg(pick("temperature_2m")))
            if _avg(pick("temperature_2m")) is not None
            else None
        ),
        "sunshine_minutes": None,
        "wind_mph": None,
        "wind_gust_mph": None,
    }
    if include_sun_wind:
        sun = _sum(pick("sunshine_duration"))
        period["sunshine_minutes"] = round(sun / 60) if sun is not None else None
        w = _avg(pick("windspeed_10m"))
        g = _max(pick("windgusts_10m"))
        period["wind_mph"] = round(w) if w is not None else None
        period["wind_gust_mph"] = round(g) if g is not None else None
    return period


def fetch_weather(force: bool = False) -> list[dict[str, Any]]:
    import time

    now = time.time()
    if not force and _CACHE["data"] and now - _CACHE["at"] < CACHE_SEC:
        return _CACHE["data"]

    lat = _secret("weather_lat", "39.0375")
    lon = _secret("weather_lon", "-95.7250")
    tz = _secret("weather_timezone", "America/Chicago")

    params = {
        "latitude": lat,
        "longitude": lon,
        "timezone": tz,
        "forecast_days": 10,
        "temperature_unit": "fahrenheit",
        "windspeed_unit": "mph",
        "precipitation_unit": "mm",
        "hourly": ",".join(
            [
                "temperature_2m",
                "precipitation_probability",
                "precipitation",
                "windspeed_10m",
                "windgusts_10m",
                "sunshine_duration",
                "weathercode",
            ]
        ),
        "daily": ",".join(
            [
                "temperature_2m_max",
                "temperature_2m_min",
                "precipitation_sum",
                "weathercode",
            ]
        ),
    }

    try:
        res = requests.get(
            "https://api.open-meteo.com/v1/forecast", params=params, timeout=12
        )
        res.raise_for_status()
        data = res.json()
    except Exception:
        return _CACHE["data"] or _fallback()

    hourly = data["hourly"]
    daily = data["daily"]
    days: list[dict[str, Any]] = []
    for idx, date_str in enumerate(daily["time"]):
        code = (daily.get("weathercode") or [None])[idx]
        days.append(
            {
                "date": date_str,
                "summary": _code_summary(code),
                "high_f": round(daily["temperature_2m_max"][idx] or 0),
                "low_f": round(daily["temperature_2m_min"][idx] or 0),
                "severe_flag": code is not None and code >= 95,
                "periods": [
                    _build_period("night", date_str, hourly, False),
                    _build_period("morning", date_str, hourly, True),
                    _build_period("afternoon", date_str, hourly, True),
                ],
            }
        )

    _CACHE["at"] = now
    _CACHE["data"] = days
    return days


def _fallback() -> list[dict[str, Any]]:
    days = []
    base = datetime.now()
    for i in range(10):
        d = (base + timedelta(days=i)).strftime("%Y-%m-%d")
        days.append(
            {
                "date": d,
                "summary": "Forecast unavailable",
                "high_f": 85,
                "low_f": 65,
                "severe_flag": False,
                "periods": [
                    {
                        "label": "night",
                        "precip_probability": None,
                        "precip_inches": None,
                        "temp_f": 68,
                        "sunshine_minutes": None,
                        "wind_mph": None,
                        "wind_gust_mph": None,
                    },
                    {
                        "label": "morning",
                        "precip_probability": None,
                        "precip_inches": None,
                        "temp_f": 78,
                        "sunshine_minutes": None,
                        "wind_mph": None,
                        "wind_gust_mph": None,
                    },
                    {
                        "label": "afternoon",
                        "precip_probability": None,
                        "precip_inches": None,
                        "temp_f": 88,
                        "sunshine_minutes": None,
                        "wind_mph": None,
                        "wind_gust_mph": None,
                    },
                ],
            }
        )
    return days
