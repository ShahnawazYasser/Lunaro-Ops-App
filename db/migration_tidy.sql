-- Chunk 14c — database tidy. WRITTEN ONLY, NOT APPLIED. Review, then run in the
-- Supabase SQL editor (or via the MCP) yourself.

create index if not exists shift_entries_venue_idx on public.shift_entries (venue_id);
create index if not exists expenses_venue_idx on public.expenses (venue_id);
create index if not exists expenses_payer_pending_idx on public.expenses (payer_user_id)
  where reimbursement_status = 'pending';
create index if not exists payout_cycles_venue_idx on public.payout_cycles (venue_id);

-- login_attempts had no primary key.
alter table public.login_attempts add column if not exists id bigserial primary key;

drop index if exists public.entry_audit_actor_idx;  -- never used

-- Legacy tables: export first (Supabase → Table editor → CSV: 5 and 7 rows), then drop.
-- Left commented on purpose.
-- drop table public.reimbursements_legacy;
-- drop table public.entry_expenses_legacy;

-- recurring_expenses.due_day is unused since payout_due became manual:
alter table public.recurring_expenses alter column due_day drop not null;
