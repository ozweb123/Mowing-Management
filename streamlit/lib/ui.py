"""Shared Streamlit UI helpers — large tap targets for phone use."""

from __future__ import annotations

import streamlit as st

STATUS_LABELS = {
    "overdue": "🔴 Overdue",
    "due": "🟠 Due today",
    "due_soon": "🟡 Due tomorrow",
    "skip_rain": "🔵 Rain skip",
    "ok": "🟢 On track",
}


def inject_css() -> None:
    st.markdown(
        """
        <style>
          .stButton > button {
            min-height: 3rem;
            font-weight: 700;
            border-radius: 0.75rem;
          }
          div[data-testid="stSidebarNav"] span {
            font-size: 1.05rem;
            font-weight: 600;
          }
          h1, h2, h3 { color: #1F4D1A !important; }
          .mmm-brand {
            font-size: 1.75rem;
            font-weight: 900;
            color: #0F2E0C;
            letter-spacing: 0.02em;
            margin-bottom: 0.25rem;
          }
          .mmm-stripe {
            height: 6px;
            border-radius: 999px;
            background: repeating-linear-gradient(
              90deg, #367C2B 0 20px, #FFDE00 20px 40px
            );
            margin-bottom: 0.75rem;
          }
          .mmm-card {
            background: rgba(255,255,255,0.72);
            border: 1px solid rgba(54,124,43,0.18);
            border-radius: 1rem;
            padding: 0.9rem 1rem;
            margin-bottom: 0.75rem;
          }
        </style>
        """,
        unsafe_allow_html=True,
    )


def brand_header(subtitle: str = "") -> None:
    st.markdown('<div class="mmm-stripe"></div>', unsafe_allow_html=True)
    st.markdown(
        '<div class="mmm-brand">Miles Mowing Management</div>',
        unsafe_allow_html=True,
    )
    st.caption("Southwest Topeka · John Deere spirit")
    if subtitle:
        st.write(subtitle)
