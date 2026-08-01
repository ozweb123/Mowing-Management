"""PIN, savings, school/sports free-time blocks."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import streamlit as st

from lib.auth import logout, require_login, update_pin
from lib.calendar_ics import build_ics
from lib.calendar_sync import (
    caldav_configured,
    get_calendar_sync_state,
    maybe_auto_sync,
    set_calendar_auto_sync,
    sync_schedule_to_icloud,
)
from lib.capacity import fmt_hour, get_capacity_settings, save_capacity_settings
from lib.db import get_conn
from lib.services import (
    ensure_calendar_token,
    get_settings,
    list_lawns,
    list_mowings,
    rotate_calendar_token,
    update_settings,
)
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

st.subheader("iPhone / iCloud calendar")
st.caption(
    "With iCloud secrets set, the schedule **auto-syncs** when Miles changes "
    "the plan (Done, Week pins, rain push, lawn edits). "
    "Apple Calendar picks it up via the **Miles Mowing** iCloud calendar."
)

cal_state = get_calendar_sync_state()
auto = st.toggle(
    "Auto-sync to iCloud when schedule changes",
    value=cal_state["auto_sync"],
)
if auto != cal_state["auto_sync"]:
    set_calendar_auto_sync(auto)
    st.rerun()

if cal_state["configured"]:
    st.success("iCloud connected — auto-sync is ready.")
    if cal_state["last_sync_at"]:
        st.caption(f"Last sync: {cal_state['last_sync_at']}")
    if cal_state["dirty"] and cal_state["auto_sync"]:
        st.info("Schedule changed — will sync on the next page load.")
    if cal_state["last_error"]:
        st.warning(f"Last sync error: {cal_state['last_error']}")

    c1, c2 = st.columns(2)
    with c1:
        if st.button("Sync now", type="primary", use_container_width=True):
            try:
                result = sync_schedule_to_icloud(10)
                st.success(
                    f"Synced “{result['calendar']}”: {result['total']} jobs "
                    f"(+{result['created']} / ~{result['updated']} / -{result['deleted']})."
                )
            except Exception as e:
                st.error(f"Sync failed: {e}")
    with c2:
        if st.button("Sync pending now", use_container_width=True):
            result = maybe_auto_sync(force=True, debounce=False)
            if result and result.get("error"):
                st.error(result["error"])
            elif result:
                st.success(f"Synced {result.get('total', 0)} jobs.")
            else:
                st.info("Nothing pending (or auto-sync off).")
    st.caption(
        "On iPhone: Calendar → calendars list → enable **Miles Mowing** under iCloud."
    )
else:
    st.warning(
        "Add iCloud secrets so sync can run automatically "
        "(use an **app-specific password**, not the normal Apple password):"
    )
    st.code(
        'icloud_apple_id = "you@icloud.com"\n'
        'icloud_app_password = "xxxx-xxxx-xxxx-xxxx"',
        language="toml",
    )
    st.markdown(
        """
1. [appleid.apple.com](https://appleid.apple.com) → **App-Specific Passwords**  
2. Paste into Streamlit Cloud → **Secrets** → Restart app  
3. Leave **Auto-sync** on — Miles won’t need to tap Sync
"""
    )

ics_bytes = build_ics(10).encode("utf-8")
st.download_button(
    label="Download schedule (.ics) backup",
    data=ics_bytes,
    file_name="miles-mowing.ics",
    mime="text/calendar",
    use_container_width=True,
)

cal_token = ensure_calendar_token()
with st.expander("Advanced: subscribe feed token (Next.js host)"):
    st.caption(
        "If you also host the Next.js app, iPhone can subscribe to a live feed that "
        "refreshes every few hours — no CalDAV password needed."
    )
    st.code(f"/api/calendar?token={cal_token}", language="text")
    st.markdown(
        "On iPhone: **Settings → Calendar → Accounts → Add Account → Other → "
        "Add Subscribed Calendar** → paste `https://YOUR-NEXTJS-HOST/api/calendar?token=…`"
    )
    if st.button("Rotate calendar token"):
        rotate_calendar_token()
        st.success("Token rotated — update any subscribed calendars.")
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
