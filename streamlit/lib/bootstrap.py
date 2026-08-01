"""
Shared page bootstrap — run pending iCloud calendar auto-sync after login.
"""

from __future__ import annotations

import streamlit as st


def run_pending_calendar_sync() -> None:
    """
    If the schedule is dirty and auto-sync is enabled, push to iCloud.
    Shows a subtle status once per successful/failed sync in the session.
    """
    try:
        from lib.calendar_sync import get_calendar_sync_state, maybe_auto_sync
    except Exception:
        return

    state = get_calendar_sync_state()
    if not state["configured"] or not state["auto_sync"] or not state["dirty"]:
        # Still surface last error lightly if any
        return

    with st.spinner("Updating iPhone calendar…"):
        result = maybe_auto_sync(force=False, debounce=True)

    if not result:
        return
    if result.get("error"):
        # Don't spam every rerun — only when we attempted
        key = "cal_sync_err_shown"
        if st.session_state.get(key) != result["error"]:
            st.warning(
                f"Calendar auto-sync failed: {result['error']} "
                "(check iCloud secrets in Streamlit settings)"
            )
            st.session_state[key] = result["error"]
    else:
        st.session_state.pop("cal_sync_err_shown", None)
        # Quiet success — avoid noisy banners every Done tap
        st.toast(
            f"Calendar updated ({result.get('total', 0)} jobs)",
            icon="📅",
        )
