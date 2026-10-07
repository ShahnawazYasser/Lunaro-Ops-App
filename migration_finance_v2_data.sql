-- ============================================================
-- LUNARO OPS — FINANCE V2 SEED DATA (Chunk 4: Lanes payout cycles +
-- rent recurring expense)
-- Purely additive data. Depends on migration_finance_v2.sql
-- (payout_cycles, recurring_expenses tables) and
-- migration_payout_due_manual.sql (payout_due as a manual field)
-- already being applied.
--
-- payout_due is intentionally left NULL on every row — Lanes' actual
-- payout date varies and isn't known in advance; it's entered by hand
-- once known (via the /payouts screen or PATCH /api/payouts/[id]).
--
-- 13 cycles total: the original 7 four-week cycles, plus 6 more added
-- when the Lanes contract was extended by 24 weeks (24 / 4 = 6 more
-- cycles), continuing the same 28-day cadence with no gap
-- (cycle_start of cycle N+1 = cycle_end of cycle N + 1 day).
-- ============================================================

do $$
declare
  v_lanes_id text;
begin
  select id into v_lanes_id from public.venues where name ilike '%Lanes%' limit 1;
  if v_lanes_id is null then
    raise exception 'No venue found matching %%Lanes%%';
  end if;

  insert into public.payout_cycles (venue_id, cycle_start, cycle_end, gross_amount, rent_deducted)
  select v_lanes_id, s::date, (s::date + 27), null, 0
  from unnest(array[
    -- Original 7 cycles
    '2026-09-26', '2026-10-24', '2026-11-21', '2026-12-19',
    '2027-01-16', '2027-02-13', '2027-03-13',
    -- 6 more from the 24-week contract extension
    '2027-04-10', '2027-05-08', '2027-06-05',
    '2027-07-03', '2027-07-31', '2027-08-28'
  ]) as s;

  insert into public.recurring_expenses (name, category, amount, due_day, venue_id, active)
  values ('Lanes rent', 'Rent', 60000, 1, v_lanes_id, true);
end $$;
