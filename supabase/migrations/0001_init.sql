-- ============================================================================
-- Davos 2027 — Harvard Reception Volunteers
-- Migration 0001: initial schema
--
-- Safe to run more than once (idempotent: uses IF NOT EXISTS / CREATE OR
-- REPLACE / DROP ... IF EXISTS). Run this in the Supabase SQL Editor, or via
-- the Supabase CLI (`supabase db push` / `psql -f`).
-- ============================================================================

-- gen_random_uuid() lives in the pgcrypto extension.
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Table: volunteers (the single source of truth — no spreadsheets)
-- ----------------------------------------------------------------------------
create table if not exists public.volunteers (
  id                   uuid        primary key default gen_random_uuid(),
  name                 text        not null,
  -- email is always stored lowercased by the app; it is the dedup key.
  email                text        not null unique,
  -- WhatsApp number (collected on the public form; null for admin-seeded rows).
  whatsapp             text,
  program              text,
  logistics            boolean     not null default false,
  sponsorship          boolean     not null default false,
  vip_outreach         boolean     not null default false,
  longer_term_strategy boolean     not null default false,
  -- self-reported by the person on the public form
  background           text,
  -- admin-only: never collected by or shown on the public form
  notes                text,
  -- admin-only: internal "strong candidate" flag, never exposed publicly
  recommended          boolean     not null default false,
  source               text        not null default 'self-signup'
                                   check (source in ('admin', 'self-signup')),
  status               text        not null default 'new'
                                   check (status in ('new', 'reviewed')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Index on email.
-- NOTE: the UNIQUE constraint on `email` above already creates a btree index
-- (volunteers_email_key), which fully satisfies the "index on email"
-- requirement and is what Postgres uses for the upsert/dedup lookups. We do not
-- add a second, redundant index on the same column.

-- ----------------------------------------------------------------------------
-- Keep updated_at fresh on every UPDATE.
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

drop trigger if exists volunteers_set_updated_at on public.volunteers;
create trigger volunteers_set_updated_at
  before update on public.volunteers
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Security: lock the table down by default.
--
-- Enable Row Level Security and create NO policies. With RLS enabled and zero
-- policies, the `anon` and `authenticated` roles can do nothing at all. The app
-- talks to the database exclusively with the `service_role` key, which bypasses
-- RLS — so the browser can never read or write this table directly.
-- ----------------------------------------------------------------------------
alter table public.volunteers enable row level security;

-- (Intentionally NO policies for anon / authenticated.)
