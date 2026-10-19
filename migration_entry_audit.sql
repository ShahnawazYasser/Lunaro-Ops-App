-- ============================================================
-- LUNARO OPS — ENTRY AUDIT TRAIL + PER-VENUE UNIQUENESS
-- Chunk 8a. Two changes to shift_entries, no UI:
--   1. Append-only change log (entry_audit), written by a trigger so no
--      code path can skip it — the employee upsert, the owner's PUT, the
--      collect toggle, and direct SQL-editor writes are all captured.
--   2. Uniqueness widened from (user_id, entry_date) to
--      (user_id, entry_date, venue_id) so one person can log two venues
--      on the same day.
--
-- APPLIED to production as `entry_audit_and_venue_uniqueness`;
-- supabase_schema.sql and lib/supabase/types.ts synced.
--
-- Who is the actor? The trigger has no session context, so it is passed
-- down per request. The app sends an `x-actor-id` header (see
-- supabaseAsActor in lib/supabase/server.ts); PostgREST exposes request
-- headers to Postgres as the `request.headers` setting. The trigger also
-- honours `app.actor_id` for callers that can set it inside their own
-- transaction (set_config('app.actor_id', '<uuid>', true)). A write that
-- sets neither logs actor_id = null — that null is the signal: the change
-- bypassed the app.
-- ============================================================

-- ------------------------------------------------------------
-- 1. entry_audit
-- ------------------------------------------------------------
-- entry_id deliberately has NO foreign key to shift_entries. A FK with
-- ON DELETE CASCADE would erase an entry's history the moment the entry is
-- deleted — the very event the log most needs to survive — and without the
-- cascade, the 'delete' audit row itself would violate the FK. History
-- outlives the row it describes.
create table public.entry_audit (
  id            bigserial primary key,
  entry_id      uuid not null,
  entry_date    date not null,
  actor_id      uuid references public.users (id),
  action        text not null check (action in ('insert','update','delete')),
  changed       jsonb not null,   -- { field: { from, to } }, changed fields only
  was_collected boolean not null default false,  -- cash already reconciled when this happened
  created_at    timestamptz not null default now()
);

create index entry_audit_entry_idx on public.entry_audit (entry_id, created_at desc);
create index entry_audit_actor_idx on public.entry_audit (actor_id, created_at desc);
create index entry_audit_date_idx  on public.entry_audit (entry_date);

-- Service-role access only, matching every other data table: RLS on, no
-- policies. Append-only: nobody gets UPDATE, DELETE or TRUNCATE.
alter table public.entry_audit enable row level security;

revoke all on public.entry_audit from public, anon, authenticated, service_role;
grant select, insert on public.entry_audit to service_role;
grant usage, select on sequence public.entry_audit_id_seq to service_role;

-- ------------------------------------------------------------
-- 2. Trigger function
-- ------------------------------------------------------------
-- SECURITY DEFINER so the insert works whichever role made the write.
-- Never raises: any failure inside is swallowed with a warning, so an audit
-- problem can never block the underlying shift_entries write.
create or replace function public.log_entry_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
    -- Resolve the actor. Missing/blank/invalid/unknown -> null, never an error.
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

      -- Nothing meaningful moved (e.g. an employee resubmitting unchanged
      -- figures, or only updated_at / last_edited_* changing): no row.
      if diff <> '{}'::jsonb then
        insert into public.entry_audit (entry_id, entry_date, actor_id, action, changed, was_collected)
        values (new.id, new.entry_date, actor, 'update', diff, coalesce(old.cash_collected, false));
      end if;

    else -- DELETE
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

  return null;  -- AFTER trigger: return value is ignored
end;
$$;

create trigger shift_entries_audit
  after insert or update or delete on public.shift_entries
  for each row execute function public.log_entry_change();

-- ------------------------------------------------------------
-- 3. Uniqueness: (user_id, entry_date) -> (user_id, entry_date, venue_id)
-- ------------------------------------------------------------
-- Existing constraint name verified against pg_constraint on the live DB:
--   shift_entries_user_id_entry_date_key  UNIQUE (user_id, entry_date)
-- Every current row satisfies the wider key by definition, so this cannot
-- fail on existing data.
--
-- Consequence: the employee POST lookup must match on venue_id too (done in
-- app/api/entries/route.ts). It also means correcting a wrong venue on an
-- existing entry is no longer an update-in-place — the venue is now part of
-- the entry's identity.
alter table public.shift_entries
  drop constraint shift_entries_user_id_entry_date_key;

alter table public.shift_entries
  add constraint shift_entries_user_date_venue_key
  unique (user_id, entry_date, venue_id);
