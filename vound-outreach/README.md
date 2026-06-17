# Vound outreach agent

A daily, **human-in-the-loop** outreach system: a Supabase database of contacts and
a local Python agent that researches, dedupes, picks targets, drafts, and **queues**
messages for review. **Nothing is ever sent automatically.** You review and click
send yourself.

**v1 scope: HBS contacts only.** MIT and Stanford contacts are migrated into the
database but the live flow is wired for HBS. The code keeps `source` as a
first-class parameter so MIT/Stanford plug in later without a rewrite.

---

## The two send paths (this drives the whole design)

**First-touch — through the HBS alumni directory, not your email.**
You do not cold-email HBS alumni from `adham@vound.ai`. First contact happens inside
the HBS directory's own "message a fellow alum" feature: you compose on their site,
HBS relays it to the alum, and you never see the alum's real email. HBS bcc's a copy
to `adham@vound.ai`.

- First-touch outreach rows have `channel = 'hbs_directory'`, `is_first_touch = true`.
- The agent presents the finished message; **you paste/confirm it in the HBS composer
  and click send** (optionally Claude in Chrome fills the form for you to review).
- No email address is needed for first-touch. The agent does **not** enrich emails.

**Follow-ups — through Gmail, only after a reply.**
An alum's real email becomes known **only when they reply** (the agent reads it from
the inbox and backfills `contacts.email`). From then on you follow up directly from
`adham@vound.ai` via the Gmail API — but only for outreach rows you explicitly
approve. Follow-up rows have `channel = 'gmail'`, `is_first_touch = false`.

**The review gate, on both paths:**
- First-touch: the daily run only ever **queues**. You send each one in HBS, then run
  `python run_daily.py mark-sent --ids <id> ...` to record it.
- Follow-ups: `send_approved()` sends **only** the outreach ids you pass it, and only
  if they are queued `gmail` follow-ups to a contact who already has an email.
- There is no auto-send anywhere.

---

## Setup

Requires Python 3.11+.

```bash
cd vound-outreach
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then fill in the values (see below)
```

Fill in `.env`:

| Variable | What it is |
|---|---|
| `SUPABASE_URL` | Project URL (public). |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret.** Supabase dashboard → Project Settings → API → `service_role`. The agent uses this; it bypasses RLS. Never commit it or ship it to a browser. |
| `OUTREACH_SENDER` | `adham@vound.ai`. Used for Gmail follow-ups only. |
| `DAILY_SEND_CAP` | First-touch messages queued per day (default 20). |
| `TARGET_SOURCE` | `HBS` for v1. |
| `GMAIL_CREDENTIALS_FILE` / `GMAIL_TOKEN_FILE` | Gmail OAuth (see below). |
| `DIRECTORY_PULL_FILE` | Where Claude in Chrome drops the directory read. |

`.env`, `data/`, `inbox/`, `review/`, and `credentials/` are gitignored. This lives in
a public Pages repo, so real contacts, drafts, secrets, and tokens stay out of git.

---

## Daily flow

```bash
python run_daily.py
```

Runs eight steps in order, logging each:

1. **HBS directory pull** — `directory.pull_directory('HBS')`. Fulfilled interactively
   by Claude in Chrome (see below). No handoff file → graceful no-op, never crashes.
2. **Dedupe + insert** — new profiles inserted only if new. Enforced in code *and* by
   a DB unique constraint on `dedupe_key` (`lower(name)|lower(company)`).
3. **Pick targets** — up to `DAILY_SEND_CAP` HBS `to_contact` contacts with no prior
   first-touch. Priority: Warm before Cold, Tier 1 < 2 < 3, then oldest-added. No email
   required.
4. **Assign A/B variant** — round-robin across active `message_variants`, balanced by
   cumulative volume. First-touch only. (With one active variant, everyone gets it.)
5. **Draft** — render the variant (`{first_name}`, `{company}`, `{role}`, `{location}`)
   and insert one specific personalization line after the greeting.
6. **Queue for review** — writes `queued` `outreach` rows and a brand-styled HTML
   dashboard at `review/queue_<date>.html`. **Nothing is sent.**
7. **Reply tracking + email backfill** — reads the inbox, matches replies (HBS
   first-touch by name/company; Gmail follow-ups by thread id), classifies them, and
   backfills the alum's real email on a real reply.
8. **Metrics** — reply rate per variant and per industry, with a sample-size caveat.

Then, for each first-touch you actually send in the HBS directory:

```bash
python run_daily.py mark-sent --ids <outreach_id> [<outreach_id> ...]
# -> outreach.status = sent; contact.status = contacted; last_contacted_at set
```

### Other commands

```bash
python run_daily.py gmail-auth                       # one-time Gmail OAuth (opens a browser)
python run_daily.py compose                          # print HBS compose payloads for Claude in Chrome
python run_daily.py send-approved --ids <id> [<id>]  # send Gmail FOLLOW-UPS (explicit approval only)
python migrate_seed.py                               # re-runnable, idempotent seed migration
```

### Cron (Mac Mini)

```cron
# 8:00am daily — queue for review only. Sending stays manual.
0 8 * * *  cd /path/to/vound-outreach && /path/to/.venv/bin/python run_daily.py >> outreach.log 2>&1
```

---

## Claude in Chrome (directory pull + first-touch compose)

The HBS directory is behind an authenticated login and **its terms prohibit bulk
scraping**. This project therefore:

- **Does not run a headless scraper** and **does not store your alumni credentials.**
- Reads the directory only through **Claude operating your already-logged-in Chrome**,
  capturing what is visible on the pages you navigate.

Two jobs (see `chrome_interface.py`):
1. **Directory pull (Step 1):** Claude reads visible profiles and calls
   `write_pull_file()` to drop `{name, company, role, location}` into
   `DIRECTORY_PULL_FILE`. Step 1 reads that file.
2. **First-touch compose (Step 6):** `compose` emits per-message payloads; Claude opens
   each alum, clicks "message a fellow alum", fills subject + body, then **stops** so
   you review and click send.

---

## Gmail (follow-ups + reply reading)

1. Google Cloud Console → enable the Gmail API → create an OAuth **Desktop app** client
   → download the client secret to `credentials/gmail_client_secret.json`.
2. `python run_daily.py gmail-auth` once (opens a browser; caches a token per sender).
3. Cron runs then reuse the cached token.

Scopes: `gmail.readonly` (reading replies) and `gmail.send` (follow-ups).

---

## Deliverability

Cold first-touch goes through the HBS directory's own messaging, so **HBS's sending
reputation carries it and the `vound.ai` domain is never exposed to cold-send spam
risk.** `adham@vound.ai` (active ~2 months, light history) only ever carries replies
and follow-ups — low-volume, high-engagement traffic that *builds* reputation. So
there is no aggressive warm-up problem here.

Still: set **SPF, DKIM, and DMARC** on `vound.ai` so follow-ups land well. The ~50/day
cold-email-per-mailbox ceiling is **not** a constraint now (we are not bulk
cold-emailing from the domain). It only becomes relevant if/when direct cold email is
added later (MIT/Stanford).

---

## Database

Six tables; snake_case; UUID PKs; `created_at`/`updated_at` with triggers. Full DDL in
[`db/schema.sql`](db/schema.sql).

- `contacts` — core table. `email` is NULL for HBS rows until a reply backfills it.
  `industry` is an indexed controlled vocabulary (Vound is industry-agnostic;
  agriculture is just the first beachhead). `dedupe_key` is a generated column with a
  UNIQUE constraint — the "never double-add a person" guarantee.
- `message_variants` — A/B copy. Edit directly in the Supabase Table Editor; set
  `active = true/false` to include/exclude a variant from the round-robin.
- `outreach` — one row per queued/sent message (`channel`, `is_first_touch`, `variant_id`,
  rendered `subject`/`body`, status, Gmail ids).
- `replies` — matched replies with classification.
- `directory_runs` — log of each morning's pull.

**Security:** RLS is enabled on every table with **no public policies**, so the anon /
public roles get nothing. The agent connects with the **service-role** key, which
bypasses RLS. Keep that key in `.env` only.

---

## Multi-founder (later)

Built for one sender (Adham) with a clean seam. `config.SENDERS` maps a name to an
identity (email + its own Gmail credential/token files); `ACTIVE_SENDER` selects one.
To add Aly or Youssef: add an entry to `SENDERS`, give them their own token file, set
`ACTIVE_SENDER`. The pipeline does not change.

---

## Project layout

```
vound-outreach/
  run_daily.py        # entry point: steps 1-8 + subcommands
  config.py           # env + sender identities (multi-founder seam)
  db.py               # Supabase client (service-role)
  directory.py        # Step 1 interface (Claude in Chrome)
  chrome_interface.py # Claude-in-Chrome seam (pull + compose)
  pipeline.py         # Steps 2-8 logic
  personalize.py      # Step 5 personalization (public fields only; never notes)
  gmail_client.py     # Step 7 reading/backfill + Step 6 send_approved
  dashboard.py        # Step 6 brand-styled review dashboard
  migrate_seed.py     # idempotent seed migration
  textutil.py         # first_name, truncate
  db/schema.sql       # full DDL (reference)
```
