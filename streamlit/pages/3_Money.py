"""Earnings, owes, expenses, truck fund."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import streamlit as st

from lib.auth import require_login
from lib.db import get_conn
from lib.services import add_expense, money_summary, update_payment
from lib.ui import brand_header, inject_css

st.set_page_config(page_title="Money — Miles Mowing", layout="centered")
inject_css()
get_conn()
require_login()
brand_header("Who paid, who owes, gas, truck fund.")

m = money_summary()
dollars = m["dollars"]
s = m["settings"]
goal = s["savings_goal_cents"]
saved = m["saved_toward_goal_cents"]
pct = min(100, round(100 * saved / goal)) if goal else 0

st.subheader(s["savings_label"])
st.markdown(f"## {dollars(saved)} / {dollars(goal)}")
st.progress(pct / 100)

c1, c2 = st.columns(2)
c1.metric("Today paid", dollars(m["day"]["paid_cents"]))
c2.metric("Week paid", dollars(m["week"]["paid_cents"]))
c3, c4 = st.columns(2)
c3.metric("Month paid", dollars(m["month"]["paid_cents"]))
c4.metric("Season paid", dollars(m["season"]["paid_cents"]))

st.markdown(f"### Owes ({dollars(m['owes_cents'])})")
if not m["outstanding"]:
    st.success("Nobody owes you — nice.")
else:
    for o in m["outstanding"]:
        with st.container(border=True):
            st.markdown(
                f"**{o['lawn_name']}** · {dollars(o['amount_cents'])}  \n"
                f"{o['mowed_at'][:10]}"
            )
            if st.button("Mark paid", key=f"pay_{o['id']}", type="primary"):
                update_payment(o["id"], "paid")
                st.rerun()

st.markdown("### Log expense")
with st.form("expense"):
    cat = st.selectbox("Category", ["gas", "blades", "oil", "parts", "other"])
    amt = st.number_input("Amount ($)", min_value=0.0, step=1.0)
    note = st.text_input("Note (optional)")
    if st.form_submit_button("Add expense", use_container_width=True):
        if amt <= 0:
            st.error("Enter an amount.")
        else:
            add_expense(cat, amt, note)
            st.success("Expense logged.")
            st.rerun()

st.markdown("#### Recent expenses")
for ex in m["expenses"][:10]:
    st.caption(
        f"{ex['category']} · {dollars(ex['amount_cents'])}"
        + (f" — {ex['note']}" if ex.get("note") else "")
    )
