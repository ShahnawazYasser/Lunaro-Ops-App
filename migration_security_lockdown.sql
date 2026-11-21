-- ============================================================
-- LUNARO OPS — SECURITY LOCKDOWN
-- Chunk 12b. Database-level lockdown + private receipts.
--
-- The app only ever talks to Postgres through the service-role key in API
-- routes, so anon/authenticated need no access to anything except the
-- public venues list. RLS already blocks them; this removes the grants too
-- (two locks, not one).
--
-- NOT YET APPLIED. Apply AFTER the 12b code is deployed: flipping the
-- receipts bucket to private first would break every existing receipt link
-- until the new signed-URL route is live.
-- ============================================================

-- View must respect the caller's permissions, not the owner's.
alter view public.asset_depreciation set (security_invoker = true);

-- Two locks, not one: RLS already blocks anon/authenticated; remove the grants too.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;

grant select on public.venues to anon, authenticated;   -- the one public-read table
grant execute on function public.replace_entry_expenses(uuid, jsonb) to service_role;

alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;

-- Pin search_path on the functions the linter flags.
-- (log_entry_change() already has search_path=public.)
alter function public.set_updated_at() set search_path = public;
alter function public.replace_entry_expenses(uuid, jsonb) set search_path = public;

-- Receipts stop being world-readable.
update storage.buckets set public = false where id = 'receipts';
