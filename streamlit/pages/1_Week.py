"""7-day weather + capacity planner."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import streamlit as st

from lib.auth import require_login
from lib.db import get_conn
from lib.services import build_week, set_planned_date
from lib.ui import STATUS_LABELS, brand_header, inject_css

st.set_page_config(page_title="Week — Miles Mowing", layout="centered")
inject_css()
get_conn()
require_login()
brand_header("Fit yards into dry windows before the week gets weird.")

view = build_week(7)
dollars = view["dollars"]

if view["suggestions"]:
    st.subheader("Dry-window moves")
    for s in view["suggestions"]:
        with st.container(border=True):
            st.markdown(f"**{s['lawn_name']}**")
            st.caption(s["note"])
            if st.button(
                f"Pin to {s['to_date'][5:]}",
                key=f"sug_{s['lawn_id']}_{s['to_date']}",
                type="primary",
                use_container_width=True,
            ):
                set_planned_date(s["lawn_id"], s["to_date"])
                st.rerun()

for day in view["days"]:
    sched_h = round(day["scheduled_minutes"] / 60, 1)
    avail_h = round(day["available_minutes"] / 60, 1)
    title = "Today" if day["is_today"] else day["weekday"]
    with st.expander(
        f"{title} {day['date'][5:]} · rain {day['rain_risk']}% · {sched_h}/{avail_h}h",
        expanded=day["is_today"] or bool(day["jobs"]),
    ):
        w = day["weather"]
        if w:
            st.caption(f"{w['summary']} · {w['high_f']}° / {w['low_f']}°")
        if day["blocked_labels"]:
            st.caption("Blocked: " + " · ".join(day["blocked_labels"]))
        if day["overbooked"]:
            st.error("Overbooked for this day.")
        if day["tip"]:
            st.info(day["tip"])

        if not day["jobs"]:
            st.write("No yards planned.")
        for job in day["jobs"]:
            lawn = job["lawn"]
            fc = job["forecast"]
            st.markdown(
                f"**{lawn['name']}** — {dollars(lawn['charge_cents'])} · "
                f"{job['estimated_minutes']}m · {STATUS_LABELS.get(fc['due_status'], '')}"
            )
            st.caption(job["fit_note"])
            c1, c2 = st.columns(2)
            if c1.button("Pin here", key=f"pin_{lawn['id']}_{day['date']}"):
                set_planned_date(lawn["id"], day["date"])
                st.rerun()
            if c2.button("Clear pin", key=f"clr_{lawn['id']}_{day['date']}"):
                set_planned_date(lawn["id"], None)
                st.rerun()
