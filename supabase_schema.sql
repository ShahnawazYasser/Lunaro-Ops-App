-- Lunaro Ops — Supabase Schema
-- Run this once against the project: https://ybovehabxjjomurhqnlm.supabase.co
-- Do NOT modify table names, column names, or types.

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────────────────────
create table public.users (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  role       text not null check (role in ('employee', 'owner')),
  pin_hash   text not null,
  created_at timestamptz not null default now()
);

-- ─── Venues ──────────────────────────────────────────────────────────────────
create table public.venues (
  id   text primary key,   -- 'tc' | 'solos' | 'lanes' | 'event'
  name text not null,
  location text
);

insert into public.venues (id, name, location) values
  ('tc',    'Third Culture',  'Model Town'),
  ('solos', 'Solos',          'Y Block'),
  ('lanes', 'Lanes Mall',     'Gulberg'),
  ('event', 'Event',          null);

-- ─── Shift Entries ───────────────────────────────────────────────────────────
create table public.shift_entries (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.users (id) on delete cascade,
  entry_date          date not null,
  venue_id            text not null references public.venues (id),

  -- Print counts
  total_prints        integer not null default 0,      -- billed @ PKR 500
  extra_prints        integer not null default 0,      -- billed @ PKR 250
  system_prints_500   integer not null default 0,      -- manual prints @ PKR 500
  system_prints_250   integer not null default 0,      -- manual prints @ PKR 250
  free_prints         integer not null default 0,      -- tracking only
  waste_prints        integer not null default 0,      -- tracking only

  -- Money
  cash_received       numeric(10,2) not null default 0,
  bank_received       numeric(10,2) not null default 0,

  -- Shift times
  clock_in            time,
  clock_out           time,

  -- Optional
  event_name          text,   -- used when venue_id = 'event'
  notes               text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (user_id, entry_date)
);

-- ─── Entry Expenses ──────────────────────────────────────────────────────────
-- Operational costs for a specific shift (fuel to venue, props, etc.)
-- These reduce that day's net revenue.
create table public.entry_expenses (
  id             uuid primary key default gen_random_uuid(),
  shift_entry_id uuid not null references public.shift_entries (id) on delete cascade,
  description    text not null,
  amount         numeric(10,2) not null,
  created_at     timestamptz not null default now()
);

-- ─── Reimbursements ──────────────────────────────────────────────────────────
-- Money the company owes an employee back (personal out-of-pocket costs).
-- NOT linked to a specific shift — independent liability.
create table public.reimbursements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users (id) on delete cascade,
  category    text not null check (category in ('Petrol', 'Food', 'Misc')),
  amount      numeric(10,2) not null,
  description text,
  receipt_url text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'paid')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Attendance Overrides ────────────────────────────────────────────────────
-- Owner-only manual correction of derived attendance.
-- Presence is derived from shift_entries; this table overrides it.
create table public.attendance_overrides (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  override_date date not null,
  is_present    boolean not null,
  created_by    uuid not null references public.users (id),
  created_at    timestamptz not null default now(),

  unique (user_id, override_date)
);

-- ─── Updated-at triggers ─────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger shift_entries_updated_at
  before update on public.shift_entries
  for each row execute function public.set_updated_at();

create trigger reimbursements_updated_at
  before update on public.reimbursements
  for each row execute function public.set_updated_at();

-- ─── Row-Level Security ───────────────────────────────────────────────────────
alter table public.users               enable row level security;
alter table public.venues              enable row level security;
alter table public.shift_entries       enable row level security;
alter table public.entry_expenses      enable row level security;
alter table public.reimbursements      enable row level security;
alter table public.attendance_overrides enable row level security;

-- venues: publicly readable (no auth needed for the dropdown list)
create policy "venues_public_read"
  on public.venues for select
  using (true);

-- All other tables: accessible only via the service role key (server-side).
-- The publishable key gets no access at all — all mutations go through API routes.
-- No per-user RLS policies needed because auth is custom PIN-based, not Supabase Auth.
