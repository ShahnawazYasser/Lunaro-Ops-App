# Lunaro Ops

Internal staff tool for Lunaro (photobooth business): shift entries, expenses, attendance, bookings and the owner's monthly dashboard. Next.js App Router + Supabase (Postgres), deployed on Vercel. Read `CLAUDE.md` before changing anything.

**Env vars** (`.env.local`, see `.env.local.example`): `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `SESSION_SECRET` (32+ chars), optional `ALLOWED_DEV_ORIGINS`.

- `npm run dev` — start the dev server
- `npm run seed` — create the first users from the `SEED_USERS` env var (`scripts/seed.ts`)
- `npx tsc --noEmit` and `npm run lint` must both be clean; `npm run build` for a production build
- **Migrations and schema** live in `db/` (`db/supabase_schema.sql` is the current full schema; `db/migration_*.sql` are the applied changes, run via the Supabase SQL editor or MCP)
