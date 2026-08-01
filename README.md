# Miles Mowing Management

John Deere–spirited, mobile-first lawn business app for **Miles** in Southwest Topeka, KS.

Track yards (recurring or adhoc), mark jobs done with one big button, forecast the next mow from season + rain, see a 10-day weather breakdown by Night / Morning / Afternoon, and watch the truck fund grow.

## Features

- **Today route** — due yards, Navigate (Apple Maps), On my way SMS, huge **Done** / **Done + Paid**
- **Lawns** — add / edit / remove; size, price, dog warning, gate code, notes, route order
- **Weather-smart forecast** — spring ~6 days, early summer ~7, late dry summer 10–12; mud / severe delays
- **10-day weather** — rain chance & inches for Night (8pm–8am), Morning (8am–1pm), Afternoon (1pm–8pm); sun & wind for AM/PM
- **Money** — paid / owes, expenses (gas, blades…), day/week/month/season, savings goal
- **Rain day push** — bump the whole route one day
- **PIN login** — httpOnly session cookies, rate-limited auth, security headers, Zod validation

## Quick start

```bash
cp .env.example .env.local   # already present in this repo for local demo
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Default PIN: **`2468`** (change under More → Settings).

## Scripts

| Command       | Purpose                |
|---------------|------------------------|
| `npm run dev` | Dev server             |
| `npm run build` / `start` | Production     |
| `npm test`    | Unit tests (Vitest)    |
| `npm run lint`| ESLint                 |

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind
- SQLite (`better-sqlite3`) in `/data/miles-mowing.db`
- Open-Meteo weather (SW Topeka coordinates)
- Zod validation, bcrypt PIN hashes, SHA-256 session tokens

## Security notes

- All mutating APIs require a valid session
- Login rate-limited; PIN stored as bcrypt hash
- CSP + security headers in `next.config.ts`
- Money stored as integer cents
- Change `SESSION_SECRET` and default PIN before any real deployment

## Location defaults

- Lat/Lon: `39.0375, -95.7250` (Southwest Topeka)
- Timezone: `America/Chicago`
