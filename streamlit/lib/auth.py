"""PIN auth via Streamlit session state + bcrypt hash in SQLite."""

from __future__ import annotations

import bcrypt
import streamlit as st

from lib.db import get_conn


def verify_pin(pin: str) -> bool:
    row = get_conn().execute(
        "SELECT pin_hash FROM settings WHERE id = 1"
    ).fetchone()
    if not row:
        return False
    try:
        return bcrypt.checkpw(pin.encode(), row["pin_hash"].encode())
    except Exception:
        return False


def update_pin(new_pin: str) -> None:
    h = bcrypt.hashpw(new_pin.encode(), bcrypt.gensalt(rounds=12)).decode()
    get_conn().execute("UPDATE settings SET pin_hash = ? WHERE id = 1", (h,))
    get_conn().commit()


def require_login() -> bool:
    """Return True if signed in; otherwise render login and stop."""
    if st.session_state.get("authed"):
        return True

    st.markdown("### Miles Mowing Management")
    st.caption("Southwest Topeka · John Deere spirit")
    st.info("Enter your PIN to open the mower dashboard.")

    # Rate-limit-ish: count bad tries in session
    fails = int(st.session_state.get("pin_fails", 0))
    if fails >= 8:
        st.error("Too many wrong PINs. Refresh the page and try again in a minute.")
        st.stop()

    pin = st.text_input("PIN", type="password", max_chars=8, key="pin_input")
    if st.button("Go", type="primary", use_container_width=True):
        if not pin.isdigit() or not (4 <= len(pin) <= 8):
            st.error("PIN must be 4–8 digits.")
        elif verify_pin(pin):
            st.session_state.authed = True
            st.session_state.pin_fails = 0
            st.rerun()
        else:
            st.session_state.pin_fails = fails + 1
            st.error("Wrong PIN. Try again.")
    st.stop()
    return False


def logout() -> None:
    st.session_state.authed = False
    st.session_state.pop("pin_input", None)
