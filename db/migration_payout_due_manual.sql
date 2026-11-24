-- ============================================================
-- LUNARO OPS — PAYOUT DUE DATE BECOMES MANUAL (Chunk 4 follow-up)
-- Depends on migration_finance_v2.sql (payout_cycles, recurring_expenses)
-- already being applied.
--
-- Lanes pays "within 10 days" of a cycle ending, but the real date varies
-- and is usually sooner — a generated "cycle_end + 10" column was a guess,
-- not the actual date. payout_due is now a plain, manually-entered date:
-- left null until the owner knows it, then set by hand (via the /payouts
-- screen or PATCH /api/payouts/[id]).
--
-- This migration only changes payout_due's column type. Nothing else in
-- payout_cycles is touched, and no existing rows are affected (no
-- payout_cycles rows exist yet as of this migration — the Chunk 4 seed
-- data has not been applied).
-- ============================================================

drop index if exists public.payout_cycles_due_idx;
alter table public.payout_cycles drop column payout_due;
alter table public.payout_cycles add column payout_due date;
create index payout_cycles_due_idx on public.payout_cycles (payout_due);

-- ─── DESIGN CONTRACT NOTE (not SQL) ──────────────────────────
-- Rent is not due on a fixed day of the calendar month. It comes out of
-- whichever payout cycle it lands in — that's what payout_cycles.rent_deducted
-- already records. recurring_expenses.due_day is kept (the column is
-- not-null in the schema) but the dashboard's rent-coverage warning no
-- longer uses it — see app/api/dashboard/route.ts's rentCoverage query,
-- which instead checks whether any payout_cycles row for the venue has a
-- known (non-null) payout_due landing in the selected month.
