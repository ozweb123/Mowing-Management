"""
Shared page bootstrap — drain leftover iCloud calendar sync if needed.
"""

from __future__ import annotations

import streamlit as st


def run_pending_calendar_sync() -> None:
    """
    Backup path: if the schedule is still dirty and no background timer is
    already queued, push to iCloud on this page load.
    """
    try:
        from lib.calendar_sync import (
            background_sync_pending,
            get_calendar_sync_state,
            maybe_auto_sync,
            schedule_background_sync,
        )
    except Exception:
        return

    state = get_calendar_sync_state()
    if not state["configured"] or not state["auto_sync"] or not state["dirty"]:
        return

    # Prefer the quiet background path — don't block the UI again.
    if background_sync_pending():
        return

    # Re-arm background sync (e.g. after a redeploy wiped in-memory timers).
    schedule_background_sync()
    if background_sync_pending():
        return

    # Fallback: sync inline if we couldn't schedule a timer.
    with st.spinner("Updating iPhone calendar…"):
        result = maybe_auto_sync(force=False, debounce=True)

    if not result:
        return
    if result.get("error"):
        key = "cal_sync_err_shown"
        if st.session_state.get(key) != result["error"]:
            st.warning(
                f"Calendar auto-sync failed: {result['error']} "
                "(check iCloud secrets in Streamlit settings)"
            )
            st.session_state[key] = result["error"]
    else:
        st.session_state.pop("cal_sync_err_shown", None)
        st.toast(
            f"Calendar updated ({result.get('total', 0)} jobs)",
            icon="📅",
        )
