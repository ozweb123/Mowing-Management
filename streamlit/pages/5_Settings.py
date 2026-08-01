"""PIN, savings, school/sports free-time blocks."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import streamlit as st

from lib.auth import logout, require_login, update_pin
from lib.capacity import fmt_hour, get_capacity_settings, save_capacity_settings
from lib.db import get_conn
from lib.services import get_settings, list_mowings, list_lawns, update_settings
from lib.ui import brand_header, inject_css

st.set_page_config(page_title="Settings — Miles Mowing", layout="centered")
inject_css()
get_conn()
require_login()
brand_header("Settings, free time, history.")

settings = get_settings()
cap = get_capacity_settings()

st.subheader("Profile & savings")
with st.form("settings"):
    owner = st.text_input("Your name", value=settings["owner_name"])
    label = st.text_input("Savings label", value=settings["savings_label"])
    goal = st.number_input(
        "Goal ($)",
        min_value=0.0,
        value=float(settings["savings_goal_cents"]) / 100,
        step=50.0,
    )
    gas = st.number_input(
        "Gas estimate / yard ($)",
        min_value=0.0,
        value=float(settings["gas_estimate_per_yard_cents"]) / 100,
        step=0.25,
    )
    new_pin = st.text_input("New PIN (optional, 4–8 digits)", type="password")
    if st.form_submit_button("Save profile", type="primary", use_container_width=True):
        update_settings(
            owner_name=owner.strip() or "Miles",
            savings_label=label.strip() or "Truck fund",
            savings_goal_cents=int(round(goal * 100)),
            gas_estimate_per_yard_cents=int(round(gas * 100)),
        )
        if new_pin:
            if new_pin.isdigit() and 4 <= len(new_pin) <= 8:
                update_pin(new_pin)
                st.success("Saved (PIN updated).")
            else:
                st.error("PIN must be 4–8 digits.")
        else:
            st.success("Saved.")
        st.rerun()

st.subheader("Free time (capacity)")
st.caption("Today & Week subtract school/sports blocks so you don't overbook.")
start = st.number_input("Start hour (0–23)", 5, 12, int(cap["available_start_hour"]))
end = st.number_input("End hour (0–23)", 12, 22, int(cap["available_end_hour"]))
st.caption(f"Window: {fmt_hour(int(start))}–{fmt_hour(int(end))}")

blocked = list(cap["blocked"])
st.write("School / sports blocks")
dow_names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
remove_idx = None
for i, b in enumerate(blocked):
    with st.container(border=True):
        c1, c2 = st.columns(2)
        b["dow"] = c1.selectbox(
            "Day",
            options=list(range(7)),
            format_func=lambda d: dow_names[d],
            index=int(b.get("dow", 2)),
            key=f"dow_{i}",
        )
        b["label"] = c2.text_input("Label", value=b.get("label", "Practice"), key=f"lab_{i}")
        c3, c4 = st.columns(2)
        b["startHour"] = c3.number_input(
            "From", 0, 23, int(b.get("startHour", 15)), key=f"sh_{i}"
        )
        b["endHour"] = c4.number_input(
            "To", 1, 24, int(b.get("endHour", 19)), key=f"eh_{i}"
        )
        if st.button("Remove block", key=f"rmb_{i}"):
            remove_idx = i

if remove_idx is not None:
    blocked.pop(remove_idx)
    save_capacity_settings(int(start), int(end), blocked)
    st.rerun()

if st.button("+ Add block"):
    blocked.append(
        {"dow": 2, "startHour": 15, "endHour": 19, "label": "Practice"}
    )
    save_capacity_settings(int(start), int(end), blocked)
    st.rerun()

if st.button("Save free time", type="primary", use_container_width=True):
    # Collect latest widget values already on blocked via keys... we mutated b dicts
    save_capacity_settings(int(start), int(end), blocked)
    st.success("Free time saved.")
    st.rerun()

st.subheader("Recent mow history")
lawns = {l["id"]: l["name"] for l in list_lawns(True)}
for mow in list_mowings(25):
    st.caption(
        f"{lawns.get(mow['lawn_id'], '?')} · {mow['mowed_at'][:10]} · "
        f"${mow['amount_cents']/100:.2f} · {mow['payment_status']}"
    )

st.divider()
if st.button("Sign out", use_container_width=True):
    logout()
    st.rerun()

st.caption("Miles Mowing Management · Streamlit · SW Topeka")
