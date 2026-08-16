-- ============================================================
-- LUNARO OPS — BOOKINGS (paid client events)
-- Locked source of truth for Phase F (simplified scope:
-- no Google Calendar sync — that comes in a later phase and
-- will ADD columns; nothing here changes for it).
-- ============================================================

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

alter table public.bookings enable row level security;
-- No policies: service-role access only, like every other data table.

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ─── REVENUE RULES (design contract, not SQL) ────────────────
-- 1. CASH BASIS, same principle as shift entries: booking revenue for
--    a month = sum(advance_amount where advance_date in month)
--            + sum(final_amount  where final_date  in month).
--    amount_charged is the deal, NOT revenue. event_date and status
--    play NO role in revenue — money received counts (a kept advance
--    on a cancelled booking is still revenue); money not received
--    never counts. Refunds are handled by editing the payment off.
-- 2. API-level validation (not DB): advance + final <= amount_charged,
--    with a friendly error.
-- 3. DOUBLE-COUNT GUARD (operational rule the owner enforces with
--    staff): client payments for booked events go on the booking row
--    ONLY — the employee working that event must NOT log them as
--    cash/bank in their shift entry. Clock in/out and prints only.
