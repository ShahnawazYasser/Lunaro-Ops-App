-- ============================================================
-- LUNARO OPS — PERFORMANCE: shift_entries date index
-- Locked source of truth for Chunk 0a (performance pass).
-- The most-queried column in the schema (month-range filtering on
-- /api/entries, /api/attendance, /api/dashboard) had no index, while
-- every other date-filtered table already did.
-- ============================================================

create index if not exists shift_entries_date_idx on public.shift_entries (entry_date);
