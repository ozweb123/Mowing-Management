"""Mower choices Miles can assign per lawn/job."""

from __future__ import annotations

MOWER_OPTIONS: dict[str, str] = {
    "bad_boy_54": 'Bad Boy 54"',
    "john_deere_60_ztrak": 'John Deere 60" ZTrak',
}

DEFAULT_MOWER = "john_deere_60_ztrak"


def mower_label(code: str | None) -> str:
    if not code:
        return MOWER_OPTIONS[DEFAULT_MOWER]
    return MOWER_OPTIONS.get(code, code)


def mower_codes() -> list[str]:
    return list(MOWER_OPTIONS.keys())
