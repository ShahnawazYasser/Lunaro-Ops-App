-- ============================================================
-- LUNARO OPS — FINANCE V2 (assets/depreciation, per-entry price
-- tracking, venue payout cycles, recurring fixed costs, owner draws)
-- Locked source of truth for Chunk 1. Purely additive — nothing
-- existing is altered or dropped.
-- ============================================================

-- Assets + straight-line depreciation
create table public.assets (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  cost               numeric(12,2) not null check (cost > 0),
  purchase_date      date not null,
  useful_life_months int not null check (useful_life_months > 0),
  salvage_value      numeric(12,2) not null default 0,
  venue_id           text references public.venues (id),
  created_at         timestamptz not null default now()
);

-- Monthly depreciation as a view, not stored rows
create view public.asset_depreciation as
select a.id as asset_id,
       a.name,
       date_trunc('month', a.purchase_date + (n || ' months')::interval)::date as month,
       round((a.cost - a.salvage_value) / a.useful_life_months, 2) as amount
from public.assets a, generate_series(0, 119) n
where n < a.useful_life_months;

-- Price offered per shift (tracking only, same as free_prints/waste_prints)
alter table public.shift_entries
  add column price_charged numeric(8,2);

-- Venue payout cycles (Lanes: 4-week cycle, paid within 10 days of cycle end)
create table public.payout_cycles (
  id              uuid primary key default gen_random_uuid(),
  venue_id        text not null references public.venues (id),
  cycle_start     date not null,
  cycle_end       date not null,
  payout_due      date generated always as (cycle_end + 10) stored,
  gross_amount    numeric(12,2),
  rent_deducted   numeric(12,2) not null default 0,
  received_on     date,
  received_amount numeric(12,2),
  constraint payout_cycles_received_pair
    check ((received_on is null) = (received_amount is null))
);
create index payout_cycles_due_idx on public.payout_cycles (payout_due);

-- Recurring fixed costs (rent, subscriptions)
create table public.recurring_expenses (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  category text not null,
  amount   numeric(12,2) not null check (amount > 0),
  due_day  int not null check (due_day between 1 and 28),
  venue_id text references public.venues (id),
  active   boolean not null default true
);

-- Owner draw flag: money pulled for personal use through a business-flow account.
-- Stays as a row for the cash trail, excluded from P&L.
alter table public.expenses
  add column is_owner_draw boolean not null default false;

alter table public.assets enable row level security;
alter table public.payout_cycles enable row level security;
alter table public.recurring_expenses enable row level security;
-- No policies: service-role access only, like every other data table.

-- ─── DESIGN CONTRACT NOTES (not SQL) ──────────────────────────
-- 1. `price_charged` is TRACKING ONLY, exactly like `free_prints` /
--    `waste_prints`. It records what price was offered that day
--    (300, 350, etc.) for reporting. It does NOT compute revenue.
--    Revenue stays `cash_received + bank_received`, unchanged by
--    this migration — deriving revenue from price × prints would
--    create a second, conflicting revenue model and risk
--    double-counting against bookings (see migration_bookings.sql's
--    cash-basis rule).
-- 2. `asset_depreciation` is a VIEW, not stored rows — it is always
--    computed live from `assets`, so there is nothing to keep in
--    sync. `generate_series(0, 119)` covers 120 months (10 years) of
--    useful life headroom; the `where n < a.useful_life_months`
--    guard trims it to the asset's actual schedule.
-- 3. `payout_cycles` and `recurring_expenses` are independent of the
--    unified `expenses` table (Phase D) — they are not expenses
--    themselves, they're inputs a future phase would use to
--    generate/reconcile expense rows or dashboard figures. This
--    migration does not wire that up.
-- 4. `is_owner_draw` marks a row in `expenses` as money pulled for
--    personal use, not a business cost. The row still exists for the
--    cash trail (an owner draw is still cash leaving the account),
--    but a future phase's P&L math must exclude `is_owner_draw = true`
--    rows from net profit — this migration only adds the flag, it
--    does not change any existing calculation.
