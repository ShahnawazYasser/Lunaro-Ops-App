-- Applied via Supabase MCP as `shift_expense_category`.
-- Shift expenses can now carry a category (validated app-side against
-- SHIFT_EXPENSE_CATEGORIES in lib/categories.ts). Missing/blank stays
-- 'Operational', so older callers keep working. Existing rows are unchanged.
create or replace function public.replace_entry_expenses(
  p_shift_entry_id uuid,
  p_expenses jsonb  -- array of {description, amount, category?}
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
    v_entry_date,
    coalesce(nullif(e->>'category', ''), 'Operational'),
    (e->>'amount')::numeric, e->>'description',
    'company', p_shift_entry_id, v_venue_id, v_user_id
  from jsonb_array_elements(p_expenses) e;
end;
$$;
