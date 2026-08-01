"""
Miles Mowing Management — Streamlit entry (Today dashboard).
Deploy on Streamlit Community Cloud with main file: streamlit/app.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import streamlit as st

from lib.auth import require_login
from lib.db import get_conn
from lib.services import (
    build_today,
    clear_rain_push,
    create_mowing,
    maps_url,
    rain_push,
    sms_url,
)
from lib.ui import STATUS_LABELS, brand_header, inject_css

st.set_page_config(
    page_title="Miles Mowing — Today",
    page_icon="🚜",
    layout="centered",
    initial_sidebar_state="expanded",
)

inject_css()
get_conn()  # ensure DB + seed
require_login()

brand_header("Good morning — let's earn.")

view = build_today()
weather = view["weather_today"]
cap = view["capacity"]
summary = view["summary"]
dollars = view["dollars"]

if weather:
    afternoon = next(
        (p for p in weather["periods"] if p["label"] == "afternoon"), None
    )
    morning = next((p for p in weather["periods"] if p["label"] == "morning"), None)
    storm = max(
        afternoon.get("precip_probability") or 0 if afternoon else 0,
        morning.get("precip_probability") or 0 if morning else 0,
    )
    st.info(
        f"**Today:** {weather['high_f']}° / {weather['low_f']}° · {weather['summary']}  \n"
        f"Afternoon storms **{storm}%**"
        + (
            f" · Wind {afternoon.get('wind_mph')} mph"
            if afternoon and afternoon.get("wind_mph") is not None
            else ""
        )
    )
    if weather.get("severe_flag"):
        st.error("Severe weather risk — hold the mower today.")
    elif storm >= 60:
        st.warning(
            f"Storms ~{storm}% this afternoon — start early, or use Rain day push."
        )

st.subheader(
    f"{summary['yard_count']} yards · {dollars(summary['estimated_cents'])} est."
)
st.caption(
    f"Gas ~{dollars(summary['gas_estimate_cents'])} · Season: {view['season'].replace('_', ' ')}"
)

# Capacity bar
fill = min(100, cap["fill_percent"])
st.markdown(f"**{round(cap['scheduled_minutes']/60, 1)} hrs scheduled / {round(cap['available_minutes']/60, 1)} hrs free** · {cap['work_window_label']}")
st.progress(fill / 100)
if cap["overbooked"]:
    st.error("Overbooked — move a yard in Week, or you'll be late for practice.")
elif cap["blocked_labels"]:
    st.caption("Blocked: " + " · ".join(cap["blocked_labels"]))

c1, c2 = st.columns(2)
with c1:
    if st.button("Rain day — push 1 day", use_container_width=True):
        rain_push(1)
        st.rerun()
with c2:
    if view.get("rain_push_until") and st.button(
        "Clear rain push", use_container_width=True
    ):
        clear_rain_push()
        st.rerun()

st.markdown("### Today's route")

if not view["jobs"]:
    st.write("No active lawns yet — add one under **Lawns**.")
else:
    for job in view["jobs"]:
        lawn = job["lawn"]
        fc = job["forecast"]
        with st.container(border=True):
            st.markdown(
                f"### {lawn['name']}  \n"
                f"{STATUS_LABELS.get(fc['due_status'], fc['due_status'])}"
            )
            st.write(
                f"{lawn['address'] or 'No address'} · "
                f"{dollars(lawn['charge_cents'])} · {job['estimated_minutes']} min"
            )
            if lawn.get("dog_warning") and lawn["dog_warning"] != "none":
                st.warning(f"Dog: {lawn['dog_warning'].replace('_', ' ')}")
            if lawn.get("notes"):
                st.caption(lawn["notes"])
            if lawn.get("gate_code"):
                st.caption(f"Gate: `{lawn['gate_code']}`")
            st.caption(fc["reason"])

            nav = maps_url(lawn["address"], lawn["city"])
            text = sms_url(
                f"Hey! This is Miles — on my way to mow {lawn['address'] or 'your yard'} shortly.",
                lawn.get("phone") or "",
            )
            a, b = st.columns(2)
            a.link_button("Navigate", nav, use_container_width=True)
            b.link_button(
                "On my way" if lawn.get("phone") else "On my way (no #)",
                text,
                use_container_width=True,
            )

            d1, d2 = st.columns([1.4, 1])
            if d1.button("DONE", key=f"done_{lawn['id']}", type="primary", use_container_width=True):
                create_mowing(lawn["id"], "owes")
                st.success(f"Marked {lawn['name']} done (owes).")
                st.rerun()
            if d2.button(
                "Done + Paid", key=f"paid_{lawn['id']}", use_container_width=True
            ):
                create_mowing(lawn["id"], "paid")
                st.success(f"Marked {lawn['name']} done + paid.")
                st.rerun()
