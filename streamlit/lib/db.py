"""
SQLite persistence for Miles Mowing (Streamlit).

Uses Turso (remote libSQL) when secrets are set so data survives
Streamlit Community Cloud redeploys. Falls back to a local SQLite file
for development.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import bcrypt

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "miles-mowing.db"

_conn_lock = threading.Lock()


class Row(dict):
    """Dict-like row that also allows integer indexing (sqlite3.Row-ish)."""

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return list(dict.values(self))[key]
        return dict.__getitem__(self, key)

    def keys(self):  # type: ignore[override]
        return dict.keys(self)


def _as_row(description: Any, values: Any) -> Row | None:
    if values is None:
        return None
    if description is None:
        return Row({str(i): v for i, v in enumerate(values)})
    cols = [d[0] for d in description]
    return Row(zip(cols, values))


class _Cursor:
    def __init__(self, cur: Any):
        self._cur = cur
        self.description = getattr(cur, "description", None)

    def fetchone(self) -> Row | None:
        return _as_row(self._cur.description, self._cur.fetchone())

    def fetchall(self) -> list[Row]:
        desc = self._cur.description
        return [_as_row(desc, r) for r in self._cur.fetchall()]  # type: ignore[misc]

    def fetchmany(self, size: int | None = None) -> list[Row]:
        desc = self._cur.description
        rows = (
            self._cur.fetchmany(size)
            if size is not None
            else self._cur.fetchmany()
        )
        return [_as_row(desc, r) for r in rows]  # type: ignore[misc]

    def __iter__(self):
        desc = self._cur.description
        for r in self._cur:
            yield _as_row(desc, r)

    @property
    def lastrowid(self) -> Any:
        return getattr(self._cur, "lastrowid", None)

    @property
    def rowcount(self) -> Any:
        return getattr(self._cur, "rowcount", -1)


class _Conn:
    """Thin wrapper so Turso/libsql and sqlite3 share one call style."""

    def __init__(self, conn: Any, backend: str):
        self._conn = conn
        self.backend = backend  # "turso" | "local"

    def execute(self, sql: str, params: Any = ()) -> _Cursor:
        if params is None:
            params = ()
        return _Cursor(self._conn.execute(sql, params))

    def executemany(self, sql: str, seq: Any) -> _Cursor:
        return _Cursor(self._conn.executemany(sql, seq))

    def executescript(self, sql: str) -> Any:
        return self._conn.executescript(sql)

    def commit(self) -> None:
        self._conn.commit()

    def rollback(self) -> None:
        self._conn.rollback()

    def close(self) -> None:
        self._conn.close()


def _turso_secrets() -> tuple[str | None, str | None]:
    url = token = None
    try:
        import streamlit as st

        url = st.secrets.get("turso_database_url") or st.secrets.get(
            "TURSO_DATABASE_URL"
        )
        token = st.secrets.get("turso_auth_token") or st.secrets.get(
            "TURSO_AUTH_TOKEN"
        )
    except Exception:
        pass
    import os

    url = url or os.environ.get("TURSO_DATABASE_URL")
    token = token or os.environ.get("TURSO_AUTH_TOKEN")
    return (
        str(url).strip() if url else None,
        str(token).strip() if token else None,
    )


def using_turso() -> bool:
    url, token = _turso_secrets()
    return bool(url and token)


def _connect() -> _Conn:
    url, token = _turso_secrets()
    if url and token:
        import libsql

        # Remote Turso/libSQL over HTTP — survives Streamlit redeploys.
        raw = libsql.connect(database=url, auth_token=token)
        conn = _Conn(raw, "turso")
        try:
            conn.execute("PRAGMA foreign_keys = ON")
        except Exception:
            pass
        return conn

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    raw = sqlite3.connect(DB_PATH, check_same_thread=False)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA foreign_keys = ON")
    # Wrap so callers always get Row dicts consistently
    return _LocalConn(raw)


class _LocalConn(_Conn):
    """sqlite3 connection that still returns our Row type via execute()."""

    def __init__(self, conn: sqlite3.Connection):
        super().__init__(conn, "local")

    def execute(self, sql: str, params: Any = ()) -> _Cursor:
        if params is None:
            params = ()
        cur = self._conn.execute(sql, params)
        # Convert sqlite3.Row → our Row for a single code path
        return _SqliteCursor(cur)

    def executemany(self, sql: str, seq: Any) -> _Cursor:
        return _SqliteCursor(self._conn.executemany(sql, seq))


class _SqliteCursor(_Cursor):
    def fetchone(self) -> Row | None:
        row = self._cur.fetchone()
        if row is None:
            return None
        return Row({k: row[k] for k in row.keys()})

    def fetchall(self) -> list[Row]:
        return [Row({k: r[k] for k in r.keys()}) for r in self._cur.fetchall()]

    def fetchmany(self, size: int | None = None) -> list[Row]:
        rows = (
            self._cur.fetchmany(size)
            if size is not None
            else self._cur.fetchmany()
        )
        return [Row({k: r[k] for k in r.keys()}) for r in rows]

    def __iter__(self):
        for r in self._cur:
            yield Row({k: r[k] for k in r.keys()})


def get_conn() -> _Conn:
    """Module-level connection reused inside a Streamlit process."""
    with _conn_lock:
        if not hasattr(get_conn, "_conn") or get_conn._conn is None:  # type: ignore[attr-defined]
            get_conn._conn = _connect()  # type: ignore[attr-defined]
            migrate(get_conn._conn)  # type: ignore[attr-defined]
        return get_conn._conn  # type: ignore[attr-defined]


def storage_label() -> str:
    """Human-readable backend for Settings UI."""
    try:
        backend = get_conn().backend
    except Exception:
        backend = "unknown"
    if backend == "turso":
        return "Turso (persistent — survives redeploys)"
    return "Local SQLite (resets on Streamlit Cloud redeploy)"


def migrate(conn: _Conn) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          owner_name TEXT NOT NULL DEFAULT 'Miles',
          pin_hash TEXT NOT NULL,
          savings_goal_cents INTEGER NOT NULL DEFAULT 300000,
          savings_label TEXT NOT NULL DEFAULT 'Truck fund',
          gas_estimate_per_yard_cents INTEGER NOT NULL DEFAULT 250,
          available_start_hour INTEGER NOT NULL DEFAULT 8,
          available_end_hour INTEGER NOT NULL DEFAULT 18,
          blocked_json TEXT NOT NULL DEFAULT '[]',
          rain_push_until TEXT,
          calendar_token TEXT,
          base_lat REAL NOT NULL DEFAULT 39.0375,
          base_lon REAL NOT NULL DEFAULT -95.7250,
          timezone TEXT NOT NULL DEFAULT 'America/Chicago'
        );

        CREATE TABLE IF NOT EXISTS lawns (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          address TEXT NOT NULL DEFAULT '',
          city TEXT NOT NULL DEFAULT 'Topeka, KS',
          notes TEXT NOT NULL DEFAULT '',
          charge_cents INTEGER NOT NULL DEFAULT 3500,
          size TEXT NOT NULL DEFAULT 'medium',
          schedule_type TEXT NOT NULL DEFAULT 'recurring',
          interval_days INTEGER,
          route_order INTEGER NOT NULL DEFAULT 100,
          dog_warning TEXT NOT NULL DEFAULT 'none',
          gate_code TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          mower TEXT NOT NULL DEFAULT 'john_deere_60_ztrak',
          planned_mow_date TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mowings (
          id TEXT PRIMARY KEY,
          lawn_id TEXT NOT NULL REFERENCES lawns(id) ON DELETE CASCADE,
          mowed_at TEXT NOT NULL,
          duration_minutes INTEGER,
          notes TEXT NOT NULL DEFAULT '',
          weather_summary TEXT NOT NULL DEFAULT '',
          amount_cents INTEGER NOT NULL,
          payment_status TEXT NOT NULL DEFAULT 'owes',
          paid_at TEXT,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT PRIMARY KEY,
          category TEXT NOT NULL,
          amount_cents INTEGER NOT NULL,
          note TEXT NOT NULL DEFAULT '',
          spent_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        """
    )
    # Lightweight migrations for older files
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(lawns)").fetchall()}
    if "phone" not in cols:
        conn.execute("ALTER TABLE lawns ADD COLUMN phone TEXT NOT NULL DEFAULT ''")
    if "planned_mow_date" not in cols:
        conn.execute("ALTER TABLE lawns ADD COLUMN planned_mow_date TEXT")
    if "mower" not in cols:
        conn.execute(
            "ALTER TABLE lawns ADD COLUMN mower TEXT NOT NULL DEFAULT 'john_deere_60_ztrak'"
        )

    settings_cols = {
        r["name"] for r in conn.execute("PRAGMA table_info(settings)").fetchall()
    }
    if "calendar_token" not in settings_cols:
        conn.execute("ALTER TABLE settings ADD COLUMN calendar_token TEXT")

    row = conn.execute("SELECT id FROM settings WHERE id = 1").fetchone()
    if not row:
        pin = "2468"
        try:
            import streamlit as st

            pin = str(st.secrets.get("pin", pin))
        except Exception:
            pass
        pin_hash = bcrypt.hashpw(pin.encode(), bcrypt.gensalt(rounds=12)).decode()
        default_blocked = json.dumps(
            [
                {
                    "dow": 2,
                    "startHour": 15,
                    "endHour": 19,
                    "label": "After school / practice",
                },
                {
                    "dow": 4,
                    "startHour": 15,
                    "endHour": 19,
                    "label": "After school / practice",
                },
            ]
        )
        conn.execute(
            """
            INSERT INTO settings (
              id, owner_name, pin_hash, savings_goal_cents, savings_label,
              gas_estimate_per_yard_cents, available_start_hour, available_end_hour,
              blocked_json
            ) VALUES (1, 'Miles', ?, 300000, 'Truck fund', 250, 8, 18, ?)
            """,
            (pin_hash, default_blocked),
        )
        _seed_lawns(conn)
    conn.commit()


def _seed_lawns(conn: _Conn) -> None:
    now = datetime.utcnow().isoformat() + "Z"
    seeds = [
        (
            "Johnson",
            "4120 SW 29th St",
            "Dog — knock first. Bag clippings near patio.",
            3500,
            "medium",
            "recurring",
            10,
            "caution",
            "",
            "785-555-0142",
            6,
        ),
        (
            "Miller",
            "2801 SW Belle Ave",
            "HOA: edge sidewalks. Blow driveway.",
            4000,
            "large",
            "recurring",
            20,
            "friendly",
            "4521",
            "785-555-0198",
            7,
        ),
        (
            "Garcia",
            "3518 SW Westport Dr",
            "Leave clippings. Side gate unlocked.",
            3000,
            "small",
            "recurring",
            30,
            "none",
            "",
            "785-555-0177",
            5,
        ),
        (
            "Peterson cleanup",
            "2240 SW Fairlawn Rd",
            "One-time storm cleanup — limbs already piled.",
            4500,
            "medium",
            "adhoc",
            40,
            "none",
            "",
            "",
            None,
        ),
    ]
    for name, addr, notes, charge, size, sched, order, dog, gate, phone, days_ago in seeds:
        lid = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO lawns (
              id, name, address, city, notes, charge_cents, size, schedule_type,
              interval_days, route_order, dog_warning, gate_code, phone, active,
              created_at, updated_at
            ) VALUES (?, ?, ?, 'Topeka, KS', ?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, ?, ?)
            """,
            (lid, name, addr, notes, charge, size, sched, order, dog, gate, phone, now, now),
        )
        if days_ago is not None:
            mowed = datetime.utcnow() - timedelta(days=days_ago)
            paid = days_ago <= 5
            conn.execute(
                """
                INSERT INTO mowings (
                  id, lawn_id, mowed_at, duration_minutes, notes, weather_summary,
                  amount_cents, payment_status, paid_at, created_at
                ) VALUES (?, ?, ?, 45, '', '', ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    lid,
                    mowed.isoformat() + "Z",
                    charge,
                    "paid" if paid else "owes",
                    mowed.isoformat() + "Z" if paid else None,
                    now,
                ),
            )


def row_to_dict(row: Row | sqlite3.Row | None) -> dict | None:
    if row is None:
        return None
    return {k: row[k] for k in row.keys()}


def dollars(cents: int) -> str:
    return f"${cents / 100:,.2f}"
