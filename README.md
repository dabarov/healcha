# healcha — personal Fitbit Air health dashboard + Telegram assistant

Single-user health tracking: pulls your Fitbit (Fitbit Air / Pixel Watch) data
from the **Google Health API** (`health.googleapis.com/v4` — the replacement
for the legacy Fitbit Web API, which this project never touches), stores it in
**Turso (libSQL)** via **Drizzle**, sends a **morning brief on Telegram**,
answers **free-text questions** about your history (read-only text-to-SQL),
and serves a **dark, baseline-relative web dashboard** on Vercel.

```
GitHub Actions cron ──▶ scripts/morning-brief.ts ─┐
Telegram /pull ──▶ api/telegram ─────────────────┼──▶ syncHealthData() ──▶ Turso
Dashboard "Sync now" ──▶ api/sync ────────────────┘         │
                                                            ▼
                       Telegram brief / dashboard ◀── metrics_daily + 30-day baselines
```

Key design points:

- **One pull function.** `src/lib/sync/syncHealthData.ts` is the only ingestion
  path; every trigger calls it. Incremental (per-type `sync_state`, 1-day
  overlap) and idempotent (upserts on natural keys — run it twice, no dupes).
- **Two-tier storage.** Raw intraday tables (heart rate at ~5s resolution,
  SpO2, steps, HRV) plus a small indexed `metrics_daily` rollup that the
  dashboard and the AI read by default.
- **Baseline-relative.** Rolling 30-day mean/σ per key metric; everything
  user-facing is expressed as deviation from *your* baseline. The API exposes
  no readiness/cardio-load or sleep score, so both are computed locally
  (`src/lib/baseline.ts`) from HRV/RHR/sleep z-scores.
- **Read-only AI SQL.** Generated SQL must be a single SELECT/WITH statement,
  mutation keywords are rejected, rows are capped at 200 (`textToSql.ts`).

---

## Setup

You'll need: a Google account with the Fitbit data, a GitHub account, and
free-tier accounts on Turso, Vercel, Telegram and Anthropic.

Copy the env template first — you'll fill it in as you go:

```sh
cp .env.example .env
openssl rand -hex 32   # → TOKEN_ENCRYPTION_KEY
openssl rand -hex 16   # → DASHBOARD_SECRET
openssl rand -hex 16   # → TELEGRAM_WEBHOOK_SECRET
```

Set `APP_TIMEZONE` to your IANA timezone (e.g. `Europe/London`) — day
boundaries, civil-time API filters and the brief all respect it.

### 1. Turso database

```sh
brew install tursodatabase/tap/turso   # or curl installer
turso auth signup
turso db create healcha
turso db show healcha --url            # → TURSO_DATABASE_URL
turso db tokens create healcha         # → TURSO_AUTH_TOKEN
```

Apply the schema (migrations are committed under `drizzle/`):

```sh
npm install
npm run db:migrate
```

### 2. Google Cloud project + Health API + OAuth client

1. [console.cloud.google.com](https://console.cloud.google.com) → create a
   project (e.g. `healcha`).
2. **APIs & Services → Library** → search **"Health API"** → Enable.
3. **APIs & Services → OAuth consent screen**:
   - User type **External**, fill in the app name + your email.
   - **Publishing status: Testing** (leave it there — no CASA/security review
     needed for personal use) and add **your own Google account as a test user**.
   - Scopes: you can skip adding them here; they're requested at runtime.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Type **Web application**.
   - Authorized redirect URIs — add **both**:
     - `http://localhost:8787/oauth/callback`
     - `https://<your-app>.vercel.app/api/auth/google/callback`
   - Copy client ID + secret into `.env`.
5. Make sure your Fitbit account is linked to this Google account (Fitbit app →
   profile → linked Google account). The Health API serves the data of the
   Google account that authorizes.

Run the one-time auth flow (stores an encrypted refresh token in Turso):

```sh
npm run auth:google
```

Open the printed URL, approve, done. Because the app is in Testing mode,
Google may expire the refresh token — when that happens the system messages
you on Telegram with a re-auth link (`/api/auth/google/start`); no silent
breakage.

### 3. Telegram bot

1. Message **@BotFather** → `/newbot` → pick a name → copy the token into
   `TELEGRAM_BOT_TOKEN`.
2. Get your chat id: message **@userinfobot** (or send your bot a message and
   open `https://api.telegram.org/bot<token>/getUpdates`). Put it in
   `TELEGRAM_CHAT_ID`.
3. After deploying to Vercel (next step), point the webhook at the app:

```sh
npm run telegram:webhook
```

### 4. Vercel

```sh
npm i -g vercel
vercel link
vercel deploy --prod
```

Set every variable from `.env.example` in **Vercel → Project → Settings →
Environment Variables** (or `vercel env add`). Set `APP_URL` to the production
URL, then redeploy and run `npm run telegram:webhook` locally.

The whole app (pages *and* API) is gated by `DASHBOARD_SECRET` via middleware:
open the URL on your phone once, enter the secret on the login page, and a
90-day cookie keeps you in. The Telegram webhook and OAuth callback have their
own auth and are exempt.

### 5. GitHub Actions (scheduler)

Push the repo to GitHub, then add **repository secrets** (Settings → Secrets
and variables → Actions → Secrets):

`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GEMINI_API_KEY` (or
`ANTHROPIC_API_KEY`), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`,
`DASHBOARD_SECRET`

and **repository variables** (same page → Variables):

`APP_URL`, `APP_TIMEZONE`, optionally `GEMINI_MODEL` / `LLM_PROVIDER` /
`ANTHROPIC_MODEL`.

Two workflows are included:

| Workflow | Schedule | What it does |
|---|---|---|
| `morning-brief.yml` | 06:15 UTC daily (**edit the cron to ~07:15 your local time; GitHub cron is UTC and doesn't follow DST**) | sync, then generate + push the Telegram brief |
| `sync.yml` | every 3 h | sync only, keeps intraday data fresh |

Both have `workflow_dispatch` for manual runs (sync accepts a `full` input to
re-pull the whole lookback window).

### 6. First pull

```sh
npm run sync          # or: message /pull to your bot
npm run dev           # dashboard at http://localhost:3000
```

The first sync backfills `SYNC_LOOKBACK_DAYS` (default 30). Baselines need ≥5
days of data before z-scores/readiness appear, and stabilize at ~30 days.

---

## Using it

**Telegram** — `/pull` (sync now), `/today` (AI brief), `/week` (7-day table),
`/trends` (30-day snapshot), `/help` — or just ask in plain English:
*"how's my HRV trending this month?"*, *"worst sleep nights in the last 30
days"*, *"resting HR on days after weightlifting"*. Every generated query is
logged to `ai_query_log` for debugging.

**Dashboard** — KPI cards (readiness, sleep score, resting HR, HRV) with
sparklines and %-vs-baseline deltas; HRV + resting-HR trends with the 30-day
baseline band (mean ± 1σ) shaded behind the line; stacked sleep stages; steps
and active-zone-minutes; the AI "today" summary (same generator as the brief);
a **Sync now** button with the last-sync timestamp. Fully responsive.

---

## Repo map

```
scripts/            cron + CLI entrypoints (auth, sync, morning-brief, webhook setup)
src/db/             Drizzle schema + Turso client        drizzle/  generated SQL migrations
src/lib/google/     OAuth + Health API client (pagination, civil-time filters)
src/lib/sync/       syncHealthData() — the single ingestion path
src/lib/baseline.ts rolling baselines, readiness + sleep-score computation
src/lib/ai/         Anthropic client, shared summary generator, text-to-SQL
src/lib/telegram/   bot commands + push helper
src/app/            Next.js dashboard + API routes        src/middleware.ts  access gate
.github/workflows/  scheduled sync + morning brief
```

## Notes & known caveats

- **Payload defensiveness.** The Health API is new; exact JSON field names for
  some data types (rollup values, HRV samples, exercise metadata) are parsed
  defensively (`deepFindNumber`, camel/snake filter fallback in
  `healthApi.ts`). If a type errors, check `sync_state.last_error` — the fix
  is usually a one-line key rename in `syncHealthData.ts`.
- **Readiness & sleep score are computed, not Fitbit's** — the API doesn't
  expose readiness/cardio-load or sleep score. Formulas in `src/lib/baseline.ts`.
- `/pull` and long syncs run inside the Telegram webhook handler; on Vercel
  the route sets `maxDuration = 300`. If your plan caps function duration
  lower, prefer the GitHub Actions sync + `/today`.
- **LLM provider** (`src/lib/ai/llm.ts`): if `GEMINI_API_KEY` is set, all
  summaries + text-to-SQL run on Gemini (`GEMINI_MODEL`, default
  `gemini-2.5-flash` — free tier via https://aistudio.google.com/apikey; a
  Gemini consumer subscription is unrelated to the API). Otherwise the
  Anthropic path is used (`ANTHROPIC_MODEL`, default `claude-haiku-4-5`).
  Force one with `LLM_PROVIDER=gemini|anthropic`.
