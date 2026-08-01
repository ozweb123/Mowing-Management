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
- SQLite lives on the Cloud instance disk — fine for Miles’ solo use; wipe/redeploy can reset data (export later if needed).
- Change the PIN after first login.

## iPhone / iCloud calendar

In the app: **Settings → iPhone / iCloud calendar**

1. **Download .ics** — quick import into Calendar (re-download after big changes)
2. **Push to iCloud (recommended for updates)** — add Streamlit secrets:

```toml
icloud_apple_id = "miles@icloud.com"
icloud_app_password = "xxxx-xxxx-xxxx-xxxx"
```

Create the app password at [appleid.apple.com](https://appleid.apple.com) → Sign-In and Security → App-Specific Passwords.  
Then tap **Sync schedule to iCloud Calendar now** — creates/updates calendar **Miles Mowing**.

## What to send Miles

Just the **Streamlit URL + PIN**. Nothing else.
