# KLTC Gohoshi Sign-Up

A trilingual (English / Chinese / Japanese) web app for KLTC's monthly
schedule and volunteer (gohoshi) sign-ups.

- **Admin** uploads the monthly schedule PDF once a month. The app
  automatically extracts every highlighted event (yellow, pink, peach,
  green) with its date, time, and bilingual name, and the admin reviews
  everything (assigning a set of volunteer roles to each event) before
  saving.
- **Everyone else** sees a calendar, clicks an event, and signs up for an
  open role by typing their name. The server enforces each role's limit and
  allows only one role per person per event date — no login required.

## How it works

- `server/` — Node.js + Express + SQLite (via `libsql`) API
  - `src/services/parse_pdf.py` — a Python script (using `pdfplumber`) that
    reads the schedule PDF's cell background colors and text positions to
    extract highlighted events. Called from Node via a child process.
  - `src/db/schema.sql` — SQLite schema (role templates, events, event
    roles, sign-ups).
  - `src/db/index.js` — the database connection. Points at a local file by
    default, or a free hosted [Turso](https://turso.tech) database if
    `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` are set (see "Deploying to
    Render" below — this is what makes a fully free deployment possible).
  - `src/routes/admin.js` — admin-only endpoints (session-protected):
    login, PDF upload/parse, role templates, event management.
  - `src/routes/public.js` — public endpoints: list events, event detail,
    sign up for a role.
- `client/` — React (Vite) frontend
  - `src/pages/Calendar.jsx` — the public month calendar.
  - `src/components/EventModal.jsx` — role list + sign-up form for one event.
  - `src/pages/Admin/` — admin login, PDF upload & review, event
    management, role-template management.
  - `src/i18n/` — English/Chinese/Japanese UI strings and a `pickLang()`
    helper that reads whichever language field (`name_en/zh/ja`) is
    available, falling back to English.

## Requirements

- Node.js 18+
- Python 3 with `pdfplumber` installed (`pip install pdfplumber`) — used
  only for reading the uploaded PDF schedules.

## Setup

### 1. Server

```bash
cd server
npm install
cp .env.example .env
# edit .env: set ADMIN_PASSWORD and SESSION_SECRET to real values
npm run seed      # creates one example role template from your Gohoshi sheet
npm start         # runs on http://localhost:4000
```

### 2. Client

```bash
cd client
npm install
npm run dev        # runs on http://localhost:5173, proxies /api to :4000
```

Open `http://localhost:5173`. The public calendar is at `/`, admin tools
are at `/admin` (password from `ADMIN_PASSWORD` in `server/.env`).

## Deploying to Render — for free

This repo includes a `render.yaml` Blueprint that deploys both services on
Render's **free tier** — $0/month, no credit card charge, ever. That's
possible because the database lives in a free [Turso](https://turso.tech)
database instead of on Render's own disk — Render's free web services don't
get a persistent disk, so anything written to local disk is wiped on every
restart, but an external database isn't affected by that.

### One-time setup

1. **Create a free Turso database** (this is your database, separate from
   Render):
   - Sign up at [turso.tech](https://turso.tech) (no card required).
   - Create a database (any name, e.g. `kltc-signup`), pick a region close
     to you.
   - From the database's page, grab its **URL** (starts with `libsql://`)
     and create/copy an **auth token**. You'll paste both into Render in
     step 3.
2. Push this repo to GitHub (Render deploys from a Git repo, not a zip
   upload).
3. In the [Render dashboard](https://dashboard.render.com), click
   **New > Blueprint** and connect the repo. Render reads `render.yaml` and
   proposes two services: `kltc-signup-api` and `kltc-signup-client`. You'll
   be prompted for three secrets:
   - **ADMIN_PASSWORD** — your real admin password (used to log into
     `/admin`)
   - **TURSO_DATABASE_URL** — the `libsql://...` URL from step 1
   - **TURSO_AUTH_TOKEN** — the auth token from step 1

   (`SESSION_SECRET` is generated for you automatically.)
4. Click **Apply**. Render builds and deploys both services — the API from
   its Dockerfile (Node + Python/pdfplumber), the client as a static build.
   First deploy takes a few minutes.
5. Once both are live, open the client's `.onrender.com` URL. The calendar
   should load empty; go to `/admin`, log in, and upload your first
   schedule PDF.

### Trade-offs of staying fully free

- **Cold starts**: Render's free web services spin down after 15 minutes of
  no traffic, and take 30-60 seconds to wake back up on the next request.
  The first person to open the calendar after a quiet spell will see a
  loading delay; after that it's fast again until it goes quiet once more.
  If that's ever a problem, upgrading just the API service to Render's
  Starter plan (~$7/mo) removes it — nothing else about the setup needs to
  change.
- **Turso free tier limits**: 5GB storage, 500M row reads/month, 10M row
  writes/month, and it doesn't expire. A small temple's monthly schedule
  and sign-ups will use a tiny fraction of that.

### A few things about the Blueprint

- `CLIENT_ORIGIN` (server) and `VITE_API_URL` (client) are wired up
  automatically via Render's cross-service references — you shouldn't need
  to hand-edit URLs anywhere.
- If you'd rather not use the Blueprint, you can create the two services by
  hand: a **Web Service** for `server/` (choose "Docker" as the runtime,
  free plan, and set `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN`/
  `ADMIN_PASSWORD`/`SESSION_SECRET`), and a **Static Site** for `client/`
  (build command `npm install && npm run build`, publish directory `dist`).
  In that case set `CLIENT_ORIGIN` (on the API) and `VITE_API_URL` (on the
  client, at build time) manually once you know both services'
  `.onrender.com` URLs.
- Custom domain: add it in the client static site's Settings, then add its
  URL to `CLIENT_ORIGIN` on the API service (comma-separated if you keep
  the onrender.com URL too).

## Deploying elsewhere

- **Server**: any host that can run a persistent Node process (a VPS,
  Railway, Fly.io, etc.) — it needs Python 3 + `pdfplumber` available
  alongside Node (the included `server/Dockerfile` handles this if your
  host supports Docker deploys). If the host gives you a real persistent
  disk, you can skip Turso entirely and just set `DB_URL=file:/path/on/that/disk/data.sqlite`;
  otherwise point it at Turso the same way as the Render setup above.
- **Client**: `npm run build` in `client/` (with `VITE_API_URL` set to your
  deployed server's `/api` URL) produces static files in `client/dist/`
  that can be served by any static host.

## Notes / things to double check

- **PDF parsing is best-effort, not pixel-perfect.** It correctly extracted
  all 23 highlighted events from the August 2026 sample schedule (dates,
  times, English/Chinese names), including tricky wrapped two-line event
  titles. But schedule layouts can vary month to month, so the review step
  before saving is deliberately part of the flow — always check the parsed
  dates/times/names before saving, and fix anything that looks off.
- **Japanese event names**: the source PDF only contains English and
  Chinese for event names (the "language" columns on the right are for
  which Zoom room to join, not a translation of the event name). The
  `name_ja` field is left blank by the parser — fill it in during review if
  you want Japanese event names to show up for Japanese-language users
  (otherwise the app falls back to English).
- **Which colors count as "events"**: the parser extracts yellow, pink,
  peach, and green highlighted rows (skipping the plain "Closed" days). If
  you'd rather it only pick up yellow, that's a one-line change in
  `EVENT_COLORS` in `parse_pdf.py`.
- **Removing a sign-up**: there's no self-service "cancel my sign-up" for
  the public yet — if someone needs to be removed, an admin can do it from
  Manage Events → expand the event → Remove next to their name.
- **Database engine**: uses [`@libsql/client`](https://github.com/tursodatabase/libsql-client-ts)
  rather than `better-sqlite3`, so the exact same code works against either
  a plain local SQLite file (nothing to set up) or a free hosted Turso
  database (needed for free-tier hosts with no persistent disk, like
  Render's free web service) — just by changing which env vars are set. See
  `server/.env.example`.
