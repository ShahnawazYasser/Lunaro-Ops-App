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

  -- Owner reconciliation: once true, this row is finalized — employee
  -- resubmission for this user+date is rejected (see replace_entry_expenses'
  -- neighboring POST /api/entries lock rule).
  cash_collected      boolean not null default false,
  cash_collected_at   timestamptz,

  -- Owner edit audit trail (Phase C). Null = never owner-edited.
  -- updated_at is not enough: it moves on any update, including the
  -- cash_collected toggle. These two mean specifically "the owner changed
  -- the data". Once last_edited_by is set, employee resubmission for this
  -- user+date is rejected, same as cash_collected.
  last_edited_by      uuid references public.users (id),
  last_edited_at      timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (user_id, entry_date)
);

-- ─── Expenses (unified money-out table, Phase D) ─────────────────────────────
-- Every rupee leaving the business is one row here.
--   paid_by = 'company'  → a normal business expense, no reimbursement status
--   paid_by = 'employee' → the employee fronted the money; the company owes
--                          them back until reimbursement_status = 'paid'
-- Either way the row is ALWAYS an expense in P&L, counted in the month of
-- expense_date. Marking one paid never moves it between months (accrual).
--
-- Replaced the old entry_expenses + reimbursements tables, which now exist
-- only as read-only historical copies (see the legacy note at the bottom of
-- this file).
create table public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  expense_date         date not null,
  category             text not null,
  -- Categories are enforced in app code (lib/categories.ts), not a DB check,
  -- so adding one later needs no migration. Current: Operational, Salary,
  -- Paper, Ink, Maintenance, Petrol, Food, Rent, Transport, Venue/Event, Misc
  amount               numeric(10,2) not null check (amount > 0),
  description          text,
  receipt_url          text,

  paid_by              text not null check (paid_by in ('company','employee')),
  payer_user_id        uuid references public.users (id),
  reimbursement_status text check (reimbursement_status in ('pending','paid')),

  related_user_id      uuid references public.users (id),  -- e.g. whose Salary
  shift_entry_id       uuid references public.shift_entries (id) on delete cascade,
  venue_id             text references public.venues (id),

  logged_by            uuid not null references public.users (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Employee-paid rows must carry payer + status; company-paid must not.
  constraint expenses_payer_consistency check (
    (paid_by = 'employee' and payer_user_id is not null and reimbursement_status is not null)
    or
    (paid_by = 'company' and payer_user_id is null and reimbursement_status is null)
  )
);

create index expenses_date_idx  on public.expenses (expense_date);
create index expenses_shift_idx on public.expenses (shift_entry_id) where shift_entry_id is not null;

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

-- ─── Login Attempts ──────────────────────────────────────────────────────────
-- Tracks failed PIN attempts for rate limiting. A row per failed attempt;
-- deleted for a name on that name's successful login.
create table public.login_attempts (
  name         text not null,
  attempted_at timestamptz not null default now()
);
create index login_attempts_name_time on public.login_attempts (name, attempted_at);

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

create trigger expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ─── Atomic expense replace ──────────────────────────────────────────────────
-- Replaces all shift-linked expenses for a shift in a single transaction
-- (delete + insert), so a failed insert can never leave a shift's expenses
-- wiped out. Shift expenses are always company-paid, category 'Operational',
-- and dated to the shift's own entry_date.
-- Name kept from Phase A so the existing rpc() callers keep working.
create or replace function public.replace_entry_expenses(
  p_shift_entry_id uuid,
  p_expenses jsonb  -- array of {description, amount}
) returns void language plpgsql as $$
declare
  v_entry_date date;
  v_venue_id   text;
  v_user_id    uuid;
begin
  select entry_date, venue_id, user_id
    into v_entry_date, v_venue_id, v_user_id
    from public.shift_entries where id = p_shift_entry_id;

  delete from public.expenses where shift_entry_id = p_shift_entry_id;

  insert into public.expenses
    (expense_date, category, amount, description,
     paid_by, shift_entry_id, venue_id, logged_by)
  select
    v_entry_date, 'Operational',
    (e->>'amount')::numeric, e->>'description',
    'company', p_shift_entry_id, v_venue_id, v_user_id
  from jsonb_array_elements(p_expenses) e;
end;
$$;

-- ─── Row-Level Security ───────────────────────────────────────────────────────
alter table public.users               enable row level security;
alter table public.venues              enable row level security;
alter table public.shift_entries       enable row level security;
alter table public.expenses            enable row level security;
alter table public.attendance_overrides enable row level security;
alter table public.login_attempts       enable row level security;

-- venues: publicly readable (no auth needed for the dropdown list)
create policy "venues_public_read"
  on public.venues for select
  using (true);

-- All other tables: accessible only via the service role key (server-side).
-- The publishable key gets no access at all — all mutations go through API routes.
-- No per-user RLS policies needed because auth is custom PIN-based, not Supabase Auth.

-- ─── Legacy tables (Phase D) ─────────────────────────────────────────────────
-- The live database still contains `reimbursements_legacy` and
-- `entry_expenses_legacy` — the pre-Phase-D tables, renamed rather than
-- dropped so the migration stays reversible. They are READ-ONLY history:
-- nothing in the app reads or writes them, and they are deliberately absent
-- from lib/supabase/types.ts. A future cleanup phase drops them once the
-- unified model has run in production for a while.
-- They are not recreated here — a fresh database has no legacy data.
