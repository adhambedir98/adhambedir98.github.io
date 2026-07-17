-- ============================================================================
-- Davos 2027 — Harvard Reception Volunteers
-- Migration 0002: outreach tracker (sponsorship now; VIP later via `track`)
--
-- Safe to run more than once. Run in the Supabase SQL Editor or via CLI.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Table: outreach — one row per person a volunteer has reached out to.
-- `track` scopes rows to a workstream; only 'sponsorship' is used today, and
-- 'vip_outreach' is pre-approved so the future VIP tracker needs no migration.
-- ----------------------------------------------------------------------------
create table if not exists public.outreach (
  id                  uuid        primary key default gen_random_uuid(),
  track               text        not null default 'sponsorship'
                                  check (track in ('sponsorship', 'vip_outreach')),
  -- who logged this outreach (a volunteer identifying by email on /sponsorship)
  submitter_name      text        not null,
  submitter_email     text        not null,  -- always stored lowercased
  -- the person being reached out to
  company             text        not null,
  contact_name        text        not null,
  contact_title       text,
  harvard_affiliation text,
  outreach_date       date,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists outreach_submitter_email_idx
  on public.outreach (submitter_email);
create index if not exists outreach_track_idx
  on public.outreach (track);

-- ----------------------------------------------------------------------------
-- Reuse the shared updated_at trigger function (defined in 0001; re-created
-- here so this migration also works standalone).
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists outreach_set_updated_at on public.outreach;
create trigger outreach_set_updated_at
  before update on public.outreach
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Security: same model as `volunteers` — RLS on, zero policies. Only the
-- server (service_role) can touch this table; the browser never can.
-- ----------------------------------------------------------------------------
alter table public.outreach enable row level security;

-- (Intentionally NO policies for anon / authenticated.)
