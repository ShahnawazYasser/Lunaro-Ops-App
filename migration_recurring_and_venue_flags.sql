-- Chunk 13b — venue flags + fixed costs that can be posted as expenses.
-- WRITE-ONLY: review, then apply (e.g. Supabase MCP apply_migration). Safe to re-run.

alter table public.venues add column if not exists active boolean not null default true;
alter table public.venues add column if not exists collects_payments boolean not null default false;
  -- true = the venue collects from guests and pays Lunaro by payout cycle (Lanes)
alter table public.venues add column if not exists default_price numeric(8,2);
  -- usual price per print at this venue; pre-fills the entry form (chunk 15)

update public.venues set collects_payments = true where id = 'lanes';
update public.venues set default_price = 500 where id in ('tc','boxpine');

alter table public.expenses add column if not exists recurring_id uuid
  references public.recurring_expenses (id) on delete set null;
alter table public.expenses add column if not exists recurring_month date;

create unique index if not exists expenses_recurring_once
  on public.expenses (recurring_id, recurring_month) where recurring_id is not null;
  -- one posting per fixed cost per month, enforced by the database

alter table public.recurring_expenses add column if not exists starts_on date;
alter table public.recurring_expenses add column if not exists ends_on date;
