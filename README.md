# Davos 2027 — Harvard Reception Volunteers

A small, polished web app to coordinate volunteers for the **Harvard Reception at
the World Economic Forum (Davos) 2027**. One app, one database:

- **`/join`** — a public, mobile-first sign-up form you paste into WhatsApp.
- **`/`** — a private admin dashboard (the live master tracker).
- **Supabase (Postgres)** — the single source of truth. No spreadsheets.

Anything submitted on the form appears in the dashboard immediately. The browser
never talks to the database directly — all reads and writes go through the
Next.js server using the Supabase **service-role** key, and the table is locked
down with Row Level Security.

---

## The four workstreams

1. **Logistics** — Ensure a seamless event on the ground: venue, timing, and media partnerships (e.g. Bloomberg, CNBC).
2. **Sponsorship** — Help secure sponsors ($50K–$1M+) across industries and geographies.
3. **VIP Outreach** — Engage prominent Harvard alumni and arrange for them to attend the reception or speak on Harvard panels during the week.
4. **Longer-Term Strategy** — Capture learnings and formalize relationships to scale this model to future WEFs and other events (Milken, Aspen, TED, etc.).

---

## Tech stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS**
- **Supabase** (Postgres + Row Level Security)
- Deployable to **Vercel**
- Minimal dependencies (`next`, `react`, `@supabase/supabase-js` only).

---

## Setup — step by step (no engineering background needed)

You'll need [Node.js 18.17+](https://nodejs.org) installed. Check with
`node -v`.

### 1. Create a free Supabase project

1. Go to <https://supabase.com>, sign in, and click **New project**.
2. Give it a name (e.g. `davos-2027-volunteers`), set a database password
   (save it somewhere — you won't need it for this app), pick a region close to
   you, and create the project. Wait ~2 minutes for it to provision.

### 2. Find your three Supabase keys

In your Supabase project, open **Project Settings** (the gear icon):

| You need | Where to find it | Goes into |
|---|---|---|
| **Project URL** | Settings → **Data API** → *Project URL* | `NEXT_PUBLIC_SUPABASE_URL` |
| **anon public key** | Settings → **API Keys** → *anon / public* | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| **service_role key** | Settings → **API Keys** → *service_role* (click to reveal) | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ The **service_role** key is a master key. Never share it, never paste it
> into a browser, and never commit it. This app only ever reads it on the server.

### 3. Fill in `.env.local`

In the project folder, copy the example file and open the copy:

```bash
cp .env.example .env.local
```

Fill in all four values:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ADMIN_PASSWORD=choose-a-long-shared-password
```

`ADMIN_PASSWORD` is the password you and your co-organizers will use to open the
dashboard. Pick something long.

### 4. Run the migration, then seed

**Create the table** (run the migration):

1. In Supabase, open the **SQL Editor** → **New query**.
2. Open `supabase/migrations/0001_init.sql` from this repo, copy its entire
   contents, paste into the editor, and click **Run**.
   (This creates the `volunteers` table, the `updated_at` trigger, and enables
   Row Level Security with no public access.)

**Load the 29 starting volunteers** (seed):

```bash
npm install
npm run seed
```

You should see `✓ Seeded 29 volunteers`. `npm run seed` is safe to re-run — it
upserts on email, so it never creates duplicates.

### 5. Run it locally

```bash
npm run dev
```

- Open <http://localhost:3000> → you'll be sent to the sign-in page. Enter your
  `ADMIN_PASSWORD` to reach the dashboard.
- Open <http://localhost:3000/join> → the public form (no password).

With the seed data, the dashboard counts should read **Logistics 8,
Sponsorship 10, VIP Outreach 21, Longer-Term Strategy 14**, and **Needs
follow-up 6**.

### 6. Deploy to Vercel

1. Push this repo to GitHub.
2. Go to <https://vercel.com>, **Add New → Project**, and import the repo.
3. Before deploying, add the **same four environment variables** under
   **Settings → Environment Variables** (use the exact names from `.env.example`).
   Make sure `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_PASSWORD` are **not**
   prefixed with `NEXT_PUBLIC_`.
4. Deploy. Your dashboard lives at `https://your-app.vercel.app/` and the public
   form at `https://your-app.vercel.app/join`.

> The migration + seed are run against Supabase directly (steps 4), so you don't
> repeat them on Vercel — Vercel just needs the env vars.

### 7. Share the form

1. On your phone, open `https://your-app.vercel.app/join` and confirm it looks
   good and submits.
2. Paste that `/join` link into your WhatsApp group. That's it — submissions
   flow straight into your dashboard, highlighted as **New** for you to review.

---

## Using the dashboard

- **Inline editing** — click any name, email, WhatsApp, program, or notes cell
  and type; it saves when you click away (Enter also saves, Esc cancels).
- **Toggle workstreams / recommended / status** — click the checkboxes, the
  ★ star, or the status pill. Changes save instantly.
- **Filters & search** — filter by workstream (click a count card), by
  Recommended, by status, or by **Needs follow-up** (anyone with zero
  workstreams). Search matches name/email/program.
- **New self-signups** are highlighted and tagged **New**; click the status pill
  to mark them **Reviewed** once triaged.
- **Copy emails (BCC)** — each workstream card has a button that copies a
  **semicolon-separated** list of that workstream's emails (ready for Outlook's
  BCC field).
- **Download CSV** — exports the entire table.
- **Add / delete** — use **+ Add volunteer**; delete with the ✕ at the end of a
  row.

The dashboard auto-refreshes every 30 seconds and when you refocus the tab, plus
a manual **Refresh** button.

---

## How the form upsert behaves (sanity check)

The public form de-duplicates on **lowercased email**:

- **Brand-new email** → inserts a row with `source = 'self-signup'` and
  `status = 'new'` (shows up highlighted in the dashboard).
- **Existing email** (someone re-submitting to change their workstreams) →
  updates their name, WhatsApp, program, the four workstreams, and background,
  and flips `status` back to `new` so you notice the change. It **preserves**
  your admin-only `notes`, the `recommended` flag, and the original `source`.

To verify end to end: submit `/join` once with a new email (it appears as a new
highlighted row), then submit again with an **existing** seed email
(e.g. `lsaid@mba2027.hbs.edu`) and different workstream checkboxes — the existing
row updates in place, its notes/recommended stay intact, and it re-flags as New.

---

## Security model

- **Row Level Security is ON** for `volunteers` with **no policies** for the
  `anon` role — so the public anon key can read/write nothing.
- **All** database access happens **server-side** (Route Handlers) using the
  **service-role** key, which lives only in a server env var and bypasses RLS.
  The browser never connects to Supabase.
- The admin dashboard and all admin APIs sit behind a **password gate**
  (`ADMIN_PASSWORD`), checked server-side, with an **httpOnly, signed session
  cookie**. Next.js middleware redirects unauthenticated visitors to `/login`.
  `/join` stays fully public.
- Light anti-spam on the form: a hidden honeypot field plus email/phone
  validation.

---

## Project structure

```
supabase/migrations/0001_init.sql   SQL migration (table, trigger, RLS)
scripts/seed.mjs                    Idempotent seed (npm run seed)
volunteers_seed.json                The 29 starting volunteers
src/middleware.ts                   Auth gate for admin routes
src/app/join/                       Public sign-up form
src/app/login/                      Password sign-in
src/app/page.tsx                    Admin dashboard (protected)
src/app/api/join/                   Public upsert endpoint
src/app/api/volunteers/             Admin CRUD (service-role)
src/app/api/login|logout/           Session cookie
src/lib/                            Supabase client, auth, helpers
src/components/                     Dashboard, JoinForm, etc.
```
