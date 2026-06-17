-- Vound outreach schema (v1: HBS live flow; MIT/Stanford migrated but not wired).
-- This is the exact DDL applied to the Supabase project. Kept here for reference
-- and reproducibility. Apply with the Supabase SQL editor or `supabase db`.

-- Shared trigger to maintain updated_at on every table. search_path pinned so the
-- function cannot be hijacked via a mutable search_path.
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- contacts ----------
create table contacts (
  id                uuid primary key default gen_random_uuid(),
  company           text not null,
  contact_name      text not null,
  role              text,
  location          text,
  email             text,                       -- NULL until an alum replies (Step 7 backfill)
  source            text not null,              -- HBS | MIT | Stanford | Other
  source_raw        text,                       -- original how_known value
  owner             text,                       -- Adham | Aly | Youssef (nullable)
  warm_cold         text,                       -- Warm | Cold (nullable)
  industry          text not null default 'other',
  category          text,                       -- granular sub-segment (seed category_name)
  tier              text,
  status            text not null default 'to_contact',
  notes             text,
  last_contacted_at timestamptz,
  dedupe_key        text generated always as (lower(btrim(contact_name)) || '|' || lower(btrim(company))) stored,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint contacts_source_chk   check (source in ('HBS','MIT','Stanford','Other')),
  constraint contacts_warmcold_chk check (warm_cold is null or warm_cold in ('Warm','Cold')),
  constraint contacts_status_chk   check (status in ('to_research','to_contact','contacted','replied','call_booked','not_interested','bounced')),
  constraint contacts_industry_chk check (industry in ('agriculture','food_and_beverage','manufacturing','logistics_and_warehousing','construction','mining','recycling_and_waste','auto_and_fleet','ports','other')),
  constraint contacts_dedupe_unique unique (dedupe_key)
);
create index contacts_industry_idx on contacts (industry);
create index contacts_status_idx   on contacts (status);
create index contacts_source_idx   on contacts (source);
create trigger contacts_set_updated_at before update on contacts
  for each row execute function set_updated_at();

-- ---------- message_variants ----------
create table message_variants (
  id         uuid primary key default gen_random_uuid(),
  label      text not null,
  subject    text not null,
  body       text not null,
  active     boolean not null default true,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger message_variants_set_updated_at before update on message_variants
  for each row execute function set_updated_at();

-- ---------- outreach ----------
create table outreach (
  id               uuid primary key default gen_random_uuid(),
  contact_id       uuid not null references contacts(id) on delete cascade,
  sender           text not null default 'adham@vound.ai',
  channel          text not null,                -- hbs_directory | gmail
  is_first_touch   boolean not null default true,
  variant_id       uuid references message_variants(id) on delete set null,
  subject          text,
  body             text,
  status           text not null default 'queued', -- queued | sent | replied | bounced | no_response
  queued_at        timestamptz default now(),
  sent_at          timestamptz,
  replied_at       timestamptz,
  gmail_message_id text,
  gmail_thread_id  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint outreach_channel_chk check (channel in ('hbs_directory','gmail')),
  constraint outreach_status_chk  check (status in ('queued','sent','replied','bounced','no_response'))
);
create index outreach_contact_idx on outreach (contact_id);
create index outreach_status_idx  on outreach (status);
create index outreach_variant_idx on outreach (variant_id);
create trigger outreach_set_updated_at before update on outreach
  for each row execute function set_updated_at();

-- ---------- replies ----------
create table replies (
  id               uuid primary key default gen_random_uuid(),
  outreach_id      uuid references outreach(id) on delete cascade,
  contact_id       uuid references contacts(id) on delete cascade,
  received_at      timestamptz,
  snippet          text,
  classification   text,                          -- real_reply | auto_reply | bounce | out_of_office
  gmail_message_id text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint replies_classification_chk check (classification is null or classification in ('real_reply','auto_reply','bounce','out_of_office'))
);
create index replies_contact_idx  on replies (contact_id);
create index replies_outreach_idx on replies (outreach_id);
create trigger replies_set_updated_at before update on replies
  for each row execute function set_updated_at();

-- ---------- directory_runs ----------
create table directory_runs (
  id                 uuid primary key default gen_random_uuid(),
  run_date           date not null default current_date,
  source             text not null default 'HBS',
  profiles_seen      int default 0,
  new_contacts_added int default 0,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger directory_runs_set_updated_at before update on directory_runs
  for each row execute function set_updated_at();

-- ---------- RLS ----------
-- Internal tool: RLS on with NO public policies, so anon/public get nothing. The
-- agent connects with the SERVICE-ROLE key, which bypasses RLS.
alter table contacts         enable row level security;
alter table message_variants enable row level security;
alter table outreach         enable row level security;
alter table replies          enable row level security;
alter table directory_runs   enable row level security;
