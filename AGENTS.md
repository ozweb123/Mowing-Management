# Miles Mowing Management

John Deere–themed lawn-business app. The repo contains **two implementations of the same product**, each with its own SQLite database (they do not share data):

| App | Path | Dev command | Port |
|-----|------|-------------|------|
| Next.js 15 (App Router, TS, Tailwind) | repo root | `npm run dev` | 3000 |
| Streamlit (Python) | `streamlit/` | `.venv/bin/streamlit run app.py` | 8501 |

Standard commands are documented in [`README.md`](README.md), [`package.json`](package.json), and [`streamlit/README.md`](streamlit/README.md).

## Cursor Cloud specific instructions

### Required local config (gitignored — recreate if missing)
- Next.js needs `.env.local` at the repo root or it fails to boot. Copy `.env.example` → `.env.local` and set `SESSION_SECRET` to a string of **at least 32 characters** (login/session code rejects shorter secrets). `DEFAULT_PIN` seeds the first-run login PIN (default `2468`).
- Streamlit needs `streamlit/.streamlit/secrets.toml`. Copy `streamlit/.streamlit/secrets.toml.example` → `secrets.toml` (the example already contains a working `pin = "2468"`).
- These files are gitignored, so they will not arrive via `git pull`; if a fresh VM is missing them, recreate them from the `.example` templates.

### Streamlit environment
- Python deps live in a virtualenv at `streamlit/.venv` (created by the update script). Always invoke via `streamlit/.venv/bin/streamlit` / `streamlit/.venv/bin/python`, not a global `streamlit`.
- Creating the venv requires the system package `python3.12-venv` (already provisioned in this environment; not part of the update script).

### Auth & first-run data
- Both apps use **PIN-only** auth (no signup/OAuth). Default PIN is `2468`.
- On first DB access each app auto-migrates its SQLite file and seeds demo lawns (Johnson, Miller, Garcia, Peterson) — no seed step needed. `npm run db:seed` in `package.json` references a `scripts/seed.ts` that does not exist; ignore it.
- SQLite files: Next.js `data/miles-mowing.db`, Streamlit `streamlit/data/miles-mowing.db` (both gitignored, auto-created).

### Network dependency
- The weather/forecast features call the Open-Meteo HTTP API (`https://api.open-meteo.com`, no key). These pages/endpoints need outbound HTTPS from the VM.
