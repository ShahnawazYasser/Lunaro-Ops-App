-- Lunaro Ops — current Supabase schema
-- Regenerated 2026-11-25 (Chunk 14a) by introspecting the live database after every
-- migration to date. Reference snapshot: for a fresh project run this file once;
-- for the live project the migration_*.sql files in this folder are the history.
-- Seed data for users is NOT here (see scripts/seed.ts). Legacy tables are kept
-- read-only until a cleanup phase drops them.

create extension if not exists "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────────────────────
create table public.users (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  role            text not null check (role in ('employee', 'owner')),
  pin_hash        text not null,                       -- bcrypt, never sent to a client
  created_at      timestamptz not null default now(),
  active          boolean not null default true,       -- deactivated users cannot sign in
  must_set_pin    boolean not null default false,      -- forced to /set-pin after add/reset
  pin_changed_at  timestamptz,
  session_version integer not null default 1           -- bump to sign the user out everywhere
);

-- ─── Venues ──────────────────────────────────────────────────────────────────
create table public.venues (
  id                text primary key,                  -- 'tc' | 'solos' | 'lanes' | 'event' | ...
  name              text not null,
  location          text,
  active            boolean not null default true,     -- hidden from /entry when false
  collects_payments boolean not null default false,    -- venue collects the money and pays us out (Lanes)
  default_price     numeric(8,2)
);

insert into public.venues (id, name, location) values
  ('tc',    'Third Culture',  'Model Town'),
  ('solos', 'Solos',          'Y Block'),
  ('lanes', 'Lanes Mall',     'Gulberg'),
  ('event', 'Event',          null);

-- ─── Shift entries ───────────────────────────────────────────────────────────
create table public.shift_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users(id) on delete cascade,
  entry_date        date not null,
  venue_id          text not null references public.venues(id),
  total_prints      integer not null default 0,        -- billed at PKR 500
  extra_prints      integer not null default 0,        -- billed at PKR 250
  system_prints_500 integer not null default 0,
  system_prints_250 integer not null default 0,
  free_prints       integer not null default 0,        -- tracking only
  waste_prints      integer not null default 0,        -- tracking only
  cash_received     numeric(10,2) not null default 0,
  bank_received     numeric(10,2) not null default 0,
  clock_in          time,
  clock_out         time,
  event_name        text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  cash_collected    boolean not null default false,    -- owner-finalised
  cash_collected_at timestamptz,
  last_edited_by    uuid references public.users(id),  -- set when the owner edits
  last_edited_at    timestamptz,
  price_charged     numeric(8,2),                      -- informational only, never revenue
  constraint shift_entries_user_date_venue_key unique (user_id, entry_date, venue_id)
);
create index shift_entries_date_idx on public.shift_entries (entry_date);

-- ─── Recurring (fixed) costs — templates, not expenses ───────────────────────
create table public.recurring_expenses (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  category  text not null,
  amount    numeric(12,2) not null check (amount > 0),
  due_day   integer not null check (due_day >= 1 and due_day <= 28),  -- informational only
  venue_id  text references public.venues(id),
  active    boolean not null default true,
  starts_on date,
  ends_on   date
);

-- ─── Expenses (every rupee out is one row) ───────────────────────────────────
-- paid_by = 'company'  → payer_user_id and reimbursement_status null
-- paid_by = 'employee' → both set; owed back until reimbursement_status = 'paid'
-- Counted in the month of expense_date regardless of payment (accrual).
create table public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  expense_date         date not null,
  category             text not null,                  -- app-enforced, see lib/categories.ts
  amount               numeric(10,2) not null check (amount > 0),
  description          text,
  receipt_url          text,                           -- storage path in the private receipts bucket
  paid_by              text not null check (paid_by in ('company', 'employee')),
  payer_user_id        uuid references public.users(id),
  reimbursement_status text check (reimbursement_status in ('pending', 'paid')),
  related_user_id      uuid references public.users(id),  -- who it is about (e.g. whose Salary)
  shift_entry_id       uuid references public.shift_entries(id) on delete cascade,
  venue_id             text references public.venues(id),
  logged_by            uuid not null references public.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  is_owner_draw        boolean not null default false, -- draws are NOT business costs
  recurring_id         uuid references public.recurring_expenses(id) on delete set null,
  recurring_month      date,
  constraint expenses_payer_consistency check (
    (paid_by = 'employee' and payer_user_id is not null and reimbursement_status is not null)
    or (paid_by = 'company' and payer_user_id is null and reimbursement_status is null)
  )
);
create index expenses_date_idx  on public.expenses (expense_date);
create index expenses_shift_idx on public.expenses (shift_entry_id) where shift_entry_id is not null;
create unique index expenses_recurring_once on public.expenses (recurring_id, recurring_month)
  where recurring_id is not null;                      -- one posting per fixed cost per month

-- ─── Attendance overrides ────────────────────────────────────────────────────
create table public.attendance_overrides (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  override_date date not null,
  is_present    boolean not null,
  created_by    uuid not null references public.users(id),
  created_at    timestamptz not null default now(),
  unique (user_id, override_date)
);

-- ─── Login attempts (rate limiting) ──────────────────────────────────────────
create table public.login_attempts (
  name         text not null,
  attempted_at timestamptz not null default now(),
  ip           text
);
create index login_attempts_name_time    on public.login_attempts (name, attempted_at);
create index login_attempts_name_ip_time on public.login_attempts (name, ip, attempted_at);

-- ─── Bookings (paid client events; cash-basis revenue by payment date) ───────
create table public.bookings (
  id             uuid primary key default gen_random_uuid(),
  client_name    text not null,
  event_name     text,
  package        text,
  amount_charged numeric(10,2) not null check (amount_charged > 0),
  event_date     date not null,
  notes          text,
  advance_amount numeric(10,2) check (advance_amount > 0),
  advance_date   date,
  final_amount   numeric(10,2) check (final_amount > 0),
  final_date     date,
  status         text not null default 'upcoming' check (status in ('upcoming', 'completed', 'cancelled')),
  created_by     uuid not null references public.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint bookings_advance_pair check ((advance_amount is null) = (advance_date is null)),
  constraint bookings_final_pair   check ((final_amount   is null) = (final_date   is null))
);
create index bookings_event_date_idx   on public.bookings (event_date);
create index bookings_advance_date_idx on public.bookings (advance_date) where advance_date is not null;
create index bookings_final_date_idx   on public.bookings (final_date)   where final_date   is not null;

-- ─── Assets + monthly depreciation ───────────────────────────────────────────
create table public.assets (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  cost               numeric(12,2) not null check (cost > 0),
  purchase_date      date not null,
  useful_life_months integer not null check (useful_life_months > 0),
  salvage_value      numeric(12,2) not null default 0,
  venue_id           text references public.venues(id),
  created_at         timestamptz not null default now()
);

create view public.asset_depreciation as
select a.id as asset_id,
       a.name,
       date_trunc('month', a.purchase_date + (n.n || ' months')::interval)::date as month,
       round((a.cost - a.salvage_value) / a.useful_life_months::numeric, 2) as amount
from public.assets a, generate_series(0, 119) n(n)
where n.n < a.useful_life_months;
alter view public.asset_depreciation set (security_invoker = true);

-- ─── Payout cycles (venues that collect money and pay us out, e.g. Lanes) ────
-- payout_due is entered by hand once known — never computed.
create table public.payout_cycles (
  id              uuid primary key default gen_random_uuid(),
  venue_id        text not null references public.venues(id),
  cycle_start     date not null,
  cycle_end       date not null,
  gross_amount    numeric(12,2),
  rent_deducted   numeric(12,2) not null default 0,
  received_on     date,
  received_amount numeric(12,2),
  payout_due      date,
  constraint payout_cycles_received_pair check ((received_on is null) = (received_amount is null))
);
create index payout_cycles_due_idx on public.payout_cycles (payout_due);

-- ─── Shift entry audit trail ─────────────────────────────────────────────────
create table public.entry_audit (
  id            bigserial primary key,
  entry_id      uuid not null,                         -- no FK: survives entry deletion
  entry_date    date not null,
  actor_id      uuid references public.users(id),
  action        text not null check (action in ('insert', 'update', 'delete')),
  changed       jsonb not null,
  was_collected boolean not null default false,
  created_at    timestamptz not null default now()
);
create index entry_audit_entry_idx on public.entry_audit (entry_id, created_at desc);
create index entry_audit_date_idx  on public.entry_audit (entry_date);
create index entry_audit_actor_idx on public.entry_audit (actor_id, created_at desc);

-- ─── Legacy tables (read-only, nothing in the app uses them) ─────────────────
create table public.reimbursements_legacy (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  category     text not null check (category in ('Petrol', 'Food', 'Misc')),
  amount       numeric(10,2) not null,
  description  text,
  receipt_url  text,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'paid')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  expense_date date not null default current_date,
  venue_id     text references public.venues(id)
);

create table public.entry_expenses_legacy (
  id             uuid primary key default gen_random_uuid(),
  shift_entry_id uuid not null references public.shift_entries(id) on delete cascade,
  description    text not null,
  amount         numeric(10,2) not null,
  created_at     timestamptz not null default now()
);

-- ─── Functions ───────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Replaces all shift-linked expenses for a shift in one transaction.
create or replace function public.replace_entry_expenses(p_shift_entry_id uuid, p_expenses jsonb)
returns void language plpgsql set search_path to 'public' as $$
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
    v_entry_date,
    coalesce(nullif(e->>'category', ''), 'Operational'),
    (e->>'amount')::numeric, e->>'description',
    'company', p_shift_entry_id, v_venue_id, v_user_id
  from jsonb_array_elements(p_expenses) e;
end;
$$;

-- Shift row + its expenses in one transaction. p_entry_id null = insert, else update.
create or replace function public.save_shift_entry(p_entry jsonb, p_expenses jsonb, p_entry_id uuid default null)
returns uuid language plpgsql set search_path to 'public' as $$
declare
  v_id uuid;
begin
  if p_entry_id is null then
    insert into public.shift_entries (
      user_id, entry_date, venue_id, event_name, clock_in, clock_out,
      total_prints, extra_prints, system_prints_500, system_prints_250,
      free_prints, waste_prints, price_charged, cash_received, bank_received,
      notes, last_edited_by, last_edited_at
    ) values (
      (p_entry->>'user_id')::uuid,
      (p_entry->>'entry_date')::date,
      p_entry->>'venue_id',
      p_entry->>'event_name',
      nullif(p_entry->>'clock_in', '')::time,
      nullif(p_entry->>'clock_out', '')::time,
      (p_entry->>'total_prints')::int,
      (p_entry->>'extra_prints')::int,
      (p_entry->>'system_prints_500')::int,
      (p_entry->>'system_prints_250')::int,
      (p_entry->>'free_prints')::int,
      (p_entry->>'waste_prints')::int,
      (p_entry->>'price_charged')::numeric,
      (p_entry->>'cash_received')::numeric,
      (p_entry->>'bank_received')::numeric,
      p_entry->>'notes',
      (p_entry->>'last_edited_by')::uuid,
      (p_entry->>'last_edited_at')::timestamptz
    )
    returning id into v_id;
  else
    update public.shift_entries set
      venue_id          = p_entry->>'venue_id',
      event_name        = p_entry->>'event_name',
      clock_in          = nullif(p_entry->>'clock_in', '')::time,
      clock_out         = nullif(p_entry->>'clock_out', '')::time,
      total_prints      = (p_entry->>'total_prints')::int,
      extra_prints      = (p_entry->>'extra_prints')::int,
      system_prints_500 = (p_entry->>'system_prints_500')::int,
      system_prints_250 = (p_entry->>'system_prints_250')::int,
      free_prints       = (p_entry->>'free_prints')::int,
      waste_prints      = (p_entry->>'waste_prints')::int,
      price_charged     = (p_entry->>'price_charged')::numeric,
      cash_received     = (p_entry->>'cash_received')::numeric,
      bank_received     = (p_entry->>'bank_received')::numeric,
      notes             = p_entry->>'notes',
      last_edited_by    = case when p_entry ? 'last_edited_by'
                               then (p_entry->>'last_edited_by')::uuid else last_edited_by end,
      last_edited_at    = case when p_entry ? 'last_edited_at'
                               then (p_entry->>'last_edited_at')::timestamptz else last_edited_at end
    where id = p_entry_id
    returning id into v_id;

    if v_id is null then
      raise exception 'shift entry % not found', p_entry_id using errcode = 'P0002';
    end if;
  end if;

  perform public.replace_entry_expenses(v_id, coalesce(p_expenses, '[]'::jsonb));
  return v_id;
end;
$$;

-- Audit trigger function. Actor comes from the x-actor-id request header
-- (supabaseAsActor in lib/supabase/server.ts) or app.actor_id. Never blocks a write.
create or replace function public.log_entry_change()
returns trigger language plpgsql security definer set search_path to 'public' as $$
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

-- ─── Triggers ────────────────────────────────────────────────────────────────
create trigger shift_entries_updated_at    before update on public.shift_entries
  for each row execute function public.set_updated_at();
create trigger expenses_updated_at         before update on public.expenses
  for each row execute function public.set_updated_at();
create trigger bookings_updated_at         before update on public.bookings
  for each row execute function public.set_updated_at();
create trigger reimbursements_updated_at   before update on public.reimbursements_legacy
  for each row execute function public.set_updated_at();
create trigger shift_entries_audit         after insert or update or delete on public.shift_entries
  for each row execute function public.log_entry_change();

-- ─── Row-level security + grants ─────────────────────────────────────────────
-- The app only talks to Supabase from API routes with the service-role key.
-- RLS is on everywhere as a backstop; venues is the one publicly readable table.
alter table public.users                 enable row level security;
alter table public.venues                enable row level security;
alter table public.shift_entries         enable row level security;
alter table public.expenses              enable row level security;
alter table public.attendance_overrides  enable row level security;
alter table public.login_attempts        enable row level security;
alter table public.bookings              enable row level security;
alter table public.assets                enable row level security;
alter table public.payout_cycles         enable row level security;
alter table public.recurring_expenses    enable row level security;
alter table public.entry_audit           enable row level security;
alter table public.reimbursements_legacy enable row level security;
alter table public.entry_expenses_legacy enable row level security;

create policy venues_public_read on public.venues for select to public using (true);

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
grant select on public.venues to anon, authenticated;
grant execute on function public.replace_entry_expenses(uuid, jsonb) to service_role;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
