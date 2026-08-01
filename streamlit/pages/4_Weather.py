"""10-day SW Topeka period forecast."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import streamlit as st

from lib.auth import require_login
from lib.db import get_conn
from lib.ui import brand_header, inject_css
from lib.weather import fetch_weather

st.set_page_config(page_title="Weather — Miles Mowing", layout="centered")
inject_css()
get_conn()
require_login()
brand_header("10-day SW Topeka — rain by period; sun & wind AM/PM.")

if st.button("Refresh forecast"):
    days = fetch_weather(force=True)
else:
    days = fetch_weather()

titles = {
    "night": "Night 8pm–8am",
    "morning": "Morning 8am–1pm",
    "afternoon": "Afternoon 1pm–8pm",
}

for i, day in enumerate(days):
    label = "Today" if i == 0 else ("Tomorrow" if i == 1 else day["date"])
    afternoon = next((p for p in day["periods"] if p["label"] == "afternoon"), None)
    rain = afternoon.get("precip_probability") if afternoon else None
    with st.expander(
        f"{label} · {day['summary']} · {day['high_f']}°/{day['low_f']}°"
        + (f" · rain {rain}%" if rain is not None else ""),
        expanded=(i == 0),
    ):
        if day.get("severe_flag"):
            st.error("Severe weather flagged.")
        for p in day["periods"]:
            st.markdown(f"**{titles[p['label']]}**")
            line = f"Rain {p['precip_probability'] if p['precip_probability'] is not None else '—'}%"
            if p.get("precip_inches") is not None:
                line += f" · {p['precip_inches']}\""
            if p.get("temp_f") is not None:
                line += f" · {p['temp_f']}°"
            st.write(line)
            if p["label"] != "night":
                sun = (
                    f"{p['sunshine_minutes']} min"
                    if p.get("sunshine_minutes") is not None
                    else "—"
                )
                wind = (
                    f"{p['wind_mph']} mph"
                    if p.get("wind_mph") is not None
                    else "—"
                )
                gust = (
                    f" (gusts {p['wind_gust_mph']})"
                    if p.get("wind_gust_mph") is not None
                    else ""
                )
                st.caption(f"Sun {sun} · Wind {wind}{gust}")
