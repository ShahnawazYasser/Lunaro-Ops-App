-- Chunk 13c — atomic save of a shift entry + its expenses.
-- WRITE-ONLY: review, then apply. Safe to re-run (create or replace).
--
-- Before: POST /api/entries wrote shift_entries, then called
-- replace_entry_expenses as a SECOND request. If the second failed, the shift
-- was saved without its expenses. This does both in one transaction.
--
-- p_entry   jsonb — snake_case shift_entries fields. Keys used:
--   always:        venue_id, event_name, clock_in, clock_out, total_prints,
--                  extra_prints, system_prints_500, system_prints_250,
--                  free_prints, waste_prints, price_charged, cash_received,
--                  bank_received, notes
--   insert only:   user_id, entry_date   (identity — never changed on update)
--   optional:      last_edited_by, last_edited_at  (owner edits; if the key is
--                  absent on update, the stored value is kept)
-- p_expenses jsonb — array of {description, amount, category?}
-- p_entry_id null = insert, otherwise update that row (error if it is missing).
--
-- The lock rule (cash_collected / last_edited_by) stays in the route. This
-- function does NOT set app.actor_id: call it through supabaseAsActor(userId)
-- so the x-actor-id request header reaches the audit trigger.
create or replace function public.save_shift_entry(
  p_entry jsonb,
  p_expenses jsonb,
  p_entry_id uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
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

revoke all on function public.save_shift_entry(jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.save_shift_entry(jsonb, jsonb, uuid) to service_role;
