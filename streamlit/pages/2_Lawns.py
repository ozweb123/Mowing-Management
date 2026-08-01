"""Lawn CRUD + route reorder."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import streamlit as st

from lib.auth import require_login
from lib.db import dollars, get_conn
from lib.services import (
    create_lawn,
    deactivate_lawn,
    list_lawns,
    reorder_lawns,
    update_lawn,
)
from lib.ui import brand_header, inject_css

st.set_page_config(page_title="Lawns — Miles Mowing", layout="centered")
inject_css()
get_conn()
require_login()
brand_header("Yards on your route — recurring or one-time.")

with st.expander("+ Add lawn", expanded=False):
    with st.form("add_lawn"):
        name = st.text_input("Name", placeholder="Johnson")
        address = st.text_input("Address", placeholder="4120 SW 29th St")
        col1, col2 = st.columns(2)
        charge = col1.number_input("Charge ($)", min_value=0.0, value=35.0, step=5.0)
        size = col2.selectbox("Size", ["small", "medium", "large", "xlarge"], index=1)
        col3, col4 = st.columns(2)
        schedule = col3.selectbox("Schedule", ["recurring", "adhoc"])
        dog = col4.selectbox(
            "Dog", ["none", "friendly", "caution", "do_not_enter"]
        )
        phone = st.text_input("Phone (On my way)", placeholder="785-555-0100")
        gate = st.text_input("Gate code")
        notes = st.text_area("Notes (HOA, clippings, etc.)")
        if st.form_submit_button("Save lawn", type="primary", use_container_width=True):
            if not name.strip():
                st.error("Name is required.")
            else:
                create_lawn(
                    {
                        "name": name.strip(),
                        "address": address.strip(),
                        "charge_dollars": charge,
                        "size": size,
                        "schedule_type": schedule,
                        "dog_warning": dog,
                        "phone": phone.strip(),
                        "gate_code": gate.strip(),
                        "notes": notes.strip(),
                    }
                )
                st.success(f"Added {name}.")
                st.rerun()

st.caption("Route order — use ↑ ↓ to match how you drive")
lawns = list_lawns(include_inactive=True)
active = [l for l in lawns if l["active"]]

for idx, lawn in enumerate(lawns):
    with st.container(border=True):
        title = lawn["name"] + ("" if lawn["active"] else " (inactive)")
        st.markdown(f"### {title}")
        st.write(
            f"{lawn['address'] or 'No address'} · {dollars(lawn['charge_cents'])} · "
            f"{lawn['schedule_type']}"
            + (f" · {lawn['phone']}" if lawn.get("phone") else "")
        )
        if lawn.get("notes"):
            st.caption(lawn["notes"])

        if lawn["active"]:
            c1, c2, c3, c4 = st.columns(4)
            if c1.button("↑", key=f"up_{lawn['id']}", use_container_width=True):
                ids = [l["id"] for l in active]
                i = ids.index(lawn["id"])
                if i > 0:
                    ids[i - 1], ids[i] = ids[i], ids[i - 1]
                    reorder_lawns(ids)
                    st.rerun()
            if c2.button("↓", key=f"dn_{lawn['id']}", use_container_width=True):
                ids = [l["id"] for l in active]
                i = ids.index(lawn["id"])
                if i < len(ids) - 1:
                    ids[i + 1], ids[i] = ids[i], ids[i + 1]
                    reorder_lawns(ids)
                    st.rerun()
            if c3.button("Edit", key=f"ed_{lawn['id']}", use_container_width=True):
                st.session_state[f"editing_{lawn['id']}"] = True
            if c4.button("Remove", key=f"rm_{lawn['id']}", use_container_width=True):
                deactivate_lawn(lawn["id"])
                st.rerun()

        if st.session_state.get(f"editing_{lawn['id']}"):
            with st.form(f"edit_{lawn['id']}"):
                phone = st.text_input("Phone", value=lawn.get("phone") or "")
                notes = st.text_area("Notes", value=lawn.get("notes") or "")
                charge = st.number_input(
                    "Charge ($)",
                    value=float(lawn["charge_cents"]) / 100,
                    step=5.0,
                )
                if st.form_submit_button("Save changes", type="primary"):
                    update_lawn(
                        lawn["id"],
                        phone=phone.strip(),
                        notes=notes.strip(),
                        charge_dollars=charge,
                    )
                    st.session_state[f"editing_{lawn['id']}"] = False
                    st.rerun()
