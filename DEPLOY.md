# Deploying to Vercel

The Supabase backend is **already provisioned, migrated, and seeded** (see facts
below). The only remaining step is deploying the Next.js app to Vercel.

> Why this file exists: the Claude Code *web* sandbox that built this app runs
> under a network policy that blocks outbound traffic to Vercel
> (`api.vercel.com` → "Host not in allowlist"), so the deploy can't run from
> inside that sandbox. Run this from a session/machine that **can** reach Vercel
> — e.g. a new Claude Code web session started with **full network access**, or
> your own laptop.

## Already-provisioned facts (non-secret)

| Thing | Value |
|---|---|
| Supabase project | `davos-2027-harvard-volunteers` |
| Supabase project ref | `kjkrvuqyszpdcirkyufb` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kjkrvuqyszpdcirkyufb.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_8BM4uoIa0ldkPbMmKeZaCA_tklywrWS` |
| Vercel team (scope) | `adhambedir-gmailcoms-projects` |
| Suggested Vercel project name | `davos-2027-harvard-volunteers` |

The migration (`supabase/migrations/0001_init.sql`) and seed (29 volunteers) are
**already applied** to that Supabase project — do **not** re-run them unless you
want to reset data.

## Secrets you must supply at deploy time (never commit these)

- `VERCEL_TOKEN` — https://vercel.com/account/tokens
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase → project → Settings → API Keys → `service_role`
- `ADMIN_PASSWORD` — pick any strong shared password for the dashboard

## One-shot deploy (run from the project root)

```bash
export VERCEL_TOKEN='...'                 # your Vercel token
export SUPABASE_SERVICE_ROLE_KEY='...'    # service_role secret
export ADMIN_PASSWORD='...'               # dashboard password

npm install -g vercel@latest

SCOPE=adhambedir-gmailcoms-projects
PROJECT=davos-2027-harvard-volunteers

# Create/link the Vercel project (no interactive prompts)
vercel link --yes --project "$PROJECT" --scope "$SCOPE" --token "$VERCEL_TOKEN"

# Set production env vars (idempotent: remove-then-add)
setenv () {
  vercel env rm "$1" production --yes --scope "$SCOPE" --token "$VERCEL_TOKEN" >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production --scope "$SCOPE" --token "$VERCEL_TOKEN"
}
setenv NEXT_PUBLIC_SUPABASE_URL      "https://kjkrvuqyszpdcirkyufb.supabase.co"
setenv NEXT_PUBLIC_SUPABASE_ANON_KEY "sb_publishable_8BM4uoIa0ldkPbMmKeZaCA_tklywrWS"
setenv SUPABASE_SERVICE_ROLE_KEY     "$SUPABASE_SERVICE_ROLE_KEY"
setenv ADMIN_PASSWORD                "$ADMIN_PASSWORD"

# Build and deploy to production
vercel pull --yes --environment=production --scope "$SCOPE" --token "$VERCEL_TOKEN"
vercel build --prod --token "$VERCEL_TOKEN"
vercel deploy --prebuilt --prod --scope "$SCOPE" --token "$VERCEL_TOKEN"
```

The final command prints the production URL. Your public sign-up form will be at
`<that-url>/join`, and the admin dashboard at `<that-url>/` (sign in with
`ADMIN_PASSWORD`).

### Note on the production branch
The app currently lives on branch `claude/elegant-pasteur-9q2z3m`. The CLI deploy
above ships whatever is in your working directory, so the branch doesn't matter
for the CLI path. If you later switch to Vercel's **Git integration**, either
merge this branch into `main` or set the project's Production Branch to
`claude/elegant-pasteur-9q2z3m` in Vercel project settings.
