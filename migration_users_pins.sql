-- Chunk 11a — users screen, self-set PINs, revocable sessions.
-- WRITE-ONLY: review, then apply. Safe to re-run.
--
-- active           false = cannot log in; history (entries, attendance, audit) is kept.
-- must_set_pin     true  = the PIN was typed by the owner (temporary); the person must choose their own.
-- pin_changed_at   when the user last chose a PIN themselves (null = still temporary).
-- session_version  bumped to sign a user out everywhere (PIN change/reset, deactivate).
--                  Every session token carries the version it was issued at.
alter table public.users add column if not exists active boolean not null default true;
alter table public.users add column if not exists must_set_pin boolean not null default false;
alter table public.users add column if not exists pin_changed_at timestamptz;
alter table public.users add column if not exists session_version int not null default 1;
