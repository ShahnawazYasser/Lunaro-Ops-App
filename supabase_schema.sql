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

  -- Widened from (user_id, entry_date) in Chunk 8a: one person can log two
  -- venues on the same day.
  constraint shift_entries_user_date_venue_key unique (user_id, entry_date, venue_id)
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

-- ─── Bookings (paid client events, Phase F) ──────────────────────────────────
-- Simplified scope: no Google Calendar sync — a later phase adds columns for
-- that; nothing here changes because of it.
create table public.bookings (
  id             uuid primary key default gen_random_uuid(),

  client_name    text not null,           -- who booked
  event_name     text,                    -- optional ("Mehndi", "Corporate launch")
  package        text,                    -- optional freeform ("2-hour booth + props")
  amount_charged numeric(10,2) not null check (amount_charged > 0),  -- the agreed deal
  event_date     date not null,
  notes          text,

  -- Payments actually received (cash basis — typically 50% before,
  -- 50% after, but amounts are free). A payment is an amount+date
  -- pair: both set or both null.
  advance_amount numeric(10,2) check (advance_amount > 0),
  advance_date   date,
  final_amount   numeric(10,2) check (final_amount > 0),
  final_date     date,

  status         text not null default 'upcoming'
                 check (status in ('upcoming','completed','cancelled')),

  created_by     uuid not null references public.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint bookings_advance_pair check ((advance_amount is null) = (advance_date is null)),
  constraint bookings_final_pair   check ((final_amount is null) = (final_date is null))
);

create index bookings_event_date_idx   on public.bookings (event_date);
create index bookings_advance_date_idx on public.bookings (advance_date) where advance_date is not null;
create index bookings_final_date_idx   on public.bookings (final_date) where final_date is not null;

-- Revenue rules (design contract, not SQL — see migration_bookings.sql and
-- the Phase F notes in CLAUDE.md for the full explanation):
--   1. CASH BASIS: booking revenue for a month = sum(advance_amount where
--      advance_date in month) + sum(final_amount where final_date in
--      month). amount_charged is the deal, NOT revenue. event_date and
--      status play NO role in revenue — a kept advance on a cancelled
--      booking still counts; money not received never counts.
--   2. API-level validation (not DB): advance + final <= amount_charged.
--   3. Double-count guard: client payments for booked events go on the
--      booking row only — never logged as cash/bank on a shift entry too.

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

create trigger bookings_updated_at
  before update on public.bookings
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

-- ─── Entry audit trail (Chunk 8a) ────────────────────────────────────────────
-- Append-only change log for shift_entries, written by a trigger so no code
-- path can skip it. entry_id has NO foreign key on purpose: history must
-- outlive the row it describes (a cascade would erase it on delete).
-- Actor comes from `app.actor_id` or the `x-actor-id` request header
-- (lib/supabase/server.ts supabaseAsActor); null actor = write bypassed the app.
create table public.entry_audit (
  id            bigserial primary key,
  entry_id      uuid not null,
  entry_date    date not null,
  actor_id      uuid references public.users (id),
  action        text not null check (action in ('insert','update','delete')),
  changed       jsonb not null,   -- { field: { from, to } }, changed fields only
  was_collected boolean not null default false,  -- cash already reconciled when this happened
  created_at    timestamptz not null default now()
);

create index entry_audit_entry_idx on public.entry_audit (entry_id, created_at desc);
create index entry_audit_actor_idx on public.entry_audit (actor_id, created_at desc);
create index entry_audit_date_idx  on public.entry_audit (entry_date);

alter table public.entry_audit enable row level security;

revoke all on public.entry_audit from public, anon, authenticated, service_role;
grant select, insert on public.entry_audit to service_role;
grant usage, select on sequence public.entry_audit_id_seq to service_role;

-- SECURITY DEFINER; never raises — an audit failure must not block the write.
create or replace function public.log_entry_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  tracked constant text[] := array[
    'venue_id', 'event_name', 'entry_date', 'clock_in', 'clock_out',
    'total_prints', 'extra_prints', 'system_prints_500', 'system_prints_250',
    'free_prints', 'waste_prints', 'price_charged',
    'cash_received', 'bank_received', 'notes', 'cash_collected'
  ];
  f         text;
  o         jsonb;
  n         jsonb;
  diff      jsonb := '{}'::jsonb;
  raw_actor text;
  actor     uuid;
begin
  begin
    raw_actor := nullif(current_setting('app.actor_id', true), '');
    if raw_actor is null then
      raw_actor := nullif(
        nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-actor-id',
        ''
      );
    end if;
    if raw_actor is not null then
      select u.id into actor from public.users u where u.id = raw_actor::uuid;
    end if;
  exception when others then
    actor := null;
  end;

  begin
    if tg_op = 'INSERT' then
      n := to_jsonb(new);
      foreach f in array tracked loop
        if n -> f <> 'null'::jsonb then
          diff := diff || jsonb_build_object(
            f, jsonb_build_object('from', 'null'::jsonb, 'to', n -> f)
          );
        end if;
      end loop;

      insert into public.entry_audit (entry_id, entry_date, actor_id, action, changed, was_collected)
      values (new.id, new.entry_date, actor, 'insert', diff, false);

    elsif tg_op = 'UPDATE' then
      o := to_jsonb(old);
      n := to_jsonb(new);
      foreach f in array tracked loop
        if o -> f is distinct from n -> f then
          diff := diff || jsonb_build_object(
            f, jsonb_build_object('from', o -> f, 'to', n -> f)
          );
        end if;
      end loop;

      if diff <> '{}'::jsonb then
        insert into public.entry_audit (entry_id, entry_date, actor_id, action, changed, was_collected)
        values (new.id, new.entry_date, actor, 'update', diff, coalesce(old.cash_collected, false));
      end if;

    else
      o := to_jsonb(old);
      foreach f in array tracked loop
        if o -> f <> 'null'::jsonb then
          diff := diff || jsonb_build_object(
            f, jsonb_build_object('from', o -> f, 'to', 'null'::jsonb)
          );
        end if;
      end loop;

      insert into public.entry_audit (entry_id, entry_date, actor_id, action, changed, was_collected)
      values (old.id, old.entry_date, actor, 'delete', diff, coalesce(old.cash_collected, false));
    end if;
  exception when others then
    raise warning 'log_entry_change failed for shift_entries %: %', tg_op, sqlerrm;
  end;

  return null;
end;
$$;

create trigger shift_entries_audit
  after insert or update or delete on public.shift_entries
  for each row execute function public.log_entry_change();

-- ─── Row-Level Security ───────────────────────────────────────────────────────
alter table public.users               enable row level security;
alter table public.venues              enable row level security;
alter table public.shift_entries       enable row level security;
alter table public.expenses            enable row level security;
alter table public.attendance_overrides enable row level security;
alter table public.login_attempts       enable row level security;
alter table public.bookings             enable row level security;

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
