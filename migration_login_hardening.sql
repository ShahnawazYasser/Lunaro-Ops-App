-- ============================================================
-- LUNARO OPS — LOGIN RATE-LIMIT HARDENING
-- Chunk 12a. Adds the client IP to login_attempts so the limit can be
-- per name + IP (5 / 15 min) with a per-name ceiling (20 / 15 min) across
-- all IPs. One person typing wrong PINs no longer locks the owner out.
--
-- APPLIED to production as `login_hardening`; supabase_schema.sql synced.
-- Backward-compatible (nullable column), applied BEFORE the 12a code deploy.
-- ============================================================

alter table public.login_attempts add column if not exists ip text;

create index if not exists login_attempts_name_ip_time
  on public.login_attempts (name, ip, attempted_at);
