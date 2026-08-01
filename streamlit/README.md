# Miles Mowing Management (Streamlit)

Python/Streamlit rewrite of Miles’ lawn business app — built for **Streamlit Community Cloud** so he can open it in **iOS Safari**.

## Features

- PIN login
- **Today** route — Done / Done + Paid, Navigate, On my way SMS, rain push, capacity bar
- **Week** planner — dry-window suggestions + pin yards to a day
- **Lawns** — add/edit/remove, phone, dog/gate notes, ↑↓ route order
- **Money** — owes, expenses, truck-fund progress
- **Weather** — 10-day Night / Morning / Afternoon (SW Topeka via Open-Meteo)
- **Settings** — PIN, savings, school/sports free-time blocks

## Run locally

```bash
cd streamlit
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
streamlit run app.py
```

Default PIN: **`2468`**

## Deploy on Streamlit Community Cloud (free)

1. Merge/push this repo to GitHub (Cloud needs repo access).
2. Go to [share.streamlit.io](https://share.streamlit.io) → **New app**.
3. Settings:
   - **Repository:** `ozweb123/Mowing-Management` (or your fork)
   - **Branch:** `main` (or this feature branch)
   - **Main file path:** `streamlit/app.py`
4. **Advanced settings → Secrets** — paste:

```toml
pin = "2468"
session_secret = "paste-a-long-random-string-here-at-least-32-chars"
weather_lat = "39.0375"
weather_lon = "-95.7250"
weather_timezone = "America/Chicago"
```

5. Deploy → copy the `https://….streamlit.app` URL.
6. Text Miles:

> Open in Safari: `https://YOUR-APP.streamlit.app`  
> PIN: `2468` (change under Settings)  
> Optional: Share → Add to Home Screen

### Notes / limits

- **Free Community Cloud** apps sleep when idle; first open after sleep can take ~30–60s.
- **Without Turso**, local SQLite is wiped on every reboot/redeploy. Add Turso secrets (below) so lawns/money/history survive.
- Change the PIN after first login.

## Keep data across redeploys (Turso — free)

Streamlit Cloud disk is temporary. Store the DB on **Turso** (free SQLite hosting):

1. Sign up at [turso.tech](https://turso.tech) (Google/GitHub login is fine).
2. **Create Database** → name it e.g. `miles-mowing` → create.
3. Open the database → copy the **URL** (`libsql://…turso.io`).
4. **Tokens** → **Create Token** → copy the token (shown once).
5. Streamlit Cloud → your app → **Settings → Secrets** → add:

```toml
turso_database_url = "libsql://miles-mowing-YOURORG.turso.io"
turso_auth_token = "eyJ..."
```

6. **Reboot** the app. Settings should show **Turso (persistent)**.
7. Re-enter lawns once (first Turso DB is empty / demo-seeded). After that, redeploys keep the data.

## iPhone / iCloud calendar (auto-sync)

In the app: **Settings → iPhone / iCloud calendar**

Add Streamlit secrets (app-specific password from [appleid.apple.com](https://appleid.apple.com)):

```toml
icloud_apple_id = "miles@icloud.com"
icloud_app_password = "xxxx-xxxx-xxxx-xxxx"
```

Leave **Auto-sync to iCloud when schedule changes** ON (default).  
Whenever Miles marks Done, pins a Week day, rain-pushes, or edits lawns, the app pushes to iCloud **by itself** in the background (~10s after the last change). Creates/updates the **Miles Mowing** iCloud calendar. No Sync button required.

A manual **Sync now** (under Settings → Manual sync) remains as a fallback.

## What to send Miles

Just the **Streamlit URL + PIN**. Nothing else.
