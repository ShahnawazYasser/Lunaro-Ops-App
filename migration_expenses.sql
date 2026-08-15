-- ============================================================
-- LUNARO OPS — UNIFIED EXPENSES MIGRATION
-- Locked source of truth for Phase D. Run steps in order via the
-- Supabase MCP server. Old tables are RENAMED to *_legacy, not
-- dropped — they get dropped only in a later cleanup once the new
-- model has been verified in production for a while.
-- ============================================================

-- ─── Step 1: New unified table ───────────────────────────────
-- Every rupee leaving the business is one row here.
--   paid_by='company'  → normal business expense, no status
--   paid_by='employee' → employee fronted the money; company owes
--                        them back until reimbursement_status='paid'.
--                        Either way it is ALWAYS an expense in P&L.
create table public.expenses (
  id                   uuid primary key default gen_random_uuid(),
  expense_date         date not null,
  category             text not null,
  -- Categories are enforced in app code (single CATEGORIES constant),
  -- not a DB check, so adding one later needs no migration. Current:
  -- Operational, Salary, Paper, Ink, Maintenance, Petrol, Food,
  -- Rent, Transport, Venue/Event, Misc
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

alter table public.expenses enable row level security;
-- No policies: service-role access only, same as every other data table.

create trigger expenses_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ─── Step 2: Migrate reimbursements → expenses ───────────────
-- status mapping: 'paid' stays 'paid'; 'pending' and 'approved' both
-- become 'pending' (two-state model — a thing is reimbursed or it isn't).
insert into public.expenses
  (expense_date, category, amount, description, receipt_url,
   paid_by, payer_user_id, reimbursement_status,
   venue_id, logged_by, created_at)
select
  r.expense_date, r.category, r.amount, r.description, r.receipt_url,
  'employee', r.user_id,
  case when r.status = 'paid' then 'paid' else 'pending' end,
  r.venue_id, r.user_id, r.created_at
from public.reimbursements r;

-- ─── Step 3: Migrate entry_expenses → expenses ───────────────
-- Shift-scoped operational costs. Company-paid, category 'Operational',
-- dated to the shift's entry_date, logged_by the shift's employee.
insert into public.expenses
  (expense_date, category, amount, description,
   paid_by, shift_entry_id, venue_id, logged_by, created_at)
select
  se.entry_date, 'Operational', ee.amount, ee.description,
  'company', ee.shift_entry_id, se.venue_id, se.user_id, ee.created_at
from public.entry_expenses ee
join public.shift_entries se on se.id = ee.shift_entry_id;

-- ─── Step 4: Verify BEFORE renaming anything ─────────────────
-- All three checks must pass (equal counts, equal sums):
select
  (select count(*) from public.reimbursements) as old_reimb_count,
  (select count(*) from public.expenses where paid_by = 'employee') as new_reimb_count,
  (select coalesce(sum(amount),0) from public.reimbursements) as old_reimb_sum,
  (select coalesce(sum(amount),0) from public.expenses where paid_by = 'employee') as new_reimb_sum;

select
  (select count(*) from public.entry_expenses) as old_opex_count,
  (select count(*) from public.expenses where shift_entry_id is not null) as new_opex_count,
  (select coalesce(sum(amount),0) from public.entry_expenses) as old_opex_sum,
  (select coalesce(sum(amount),0) from public.expenses where shift_entry_id is not null) as new_opex_sum;

-- ─── Step 5: Retire old tables (rename, don't drop) ──────────
alter table public.reimbursements rename to reimbursements_legacy;
alter table public.entry_expenses rename to entry_expenses_legacy;

-- ─── Step 6: Repoint the atomic-replace RPC at expenses ──────
create or replace function public.replace_entry_expenses(
  p_shift_entry_id uuid,
  p_expenses jsonb
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
