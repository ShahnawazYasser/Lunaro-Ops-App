# Lunaro Ops App — Project Context for Claude Code

> Read this file in full before doing anything. It covers who's building this,
> what the app is, the locked data model, the working rules, and current
> build status. Update the "Current Build Status" section at the end of
> every phase, before ending the session.

---

## Who Is Building This

**Builder:** Shahnawaz Yasser — Lahore, Pakistan.
**Context:** Founder of Lunaro, a photobooth business + SaaS platform. This
app (Lunaro Ops) is an internal staff tool, separate from the customer-facing
Lunaro OS booth software (a different repo/project). It will eventually
integrate with Lunaro OS, but that's a future phase — not now.

**Working style:** Direct, zero fluff, technical. Don't over-explain basics.
Quality over speed — confirm one thing works before moving to the next.
Root cause fixes, not surface patches. Frame tradeoffs in plain terms when
they matter (cost, risk, complexity) rather than burying them.

---

## What This App Is

An internal tool for a 3-person team: **Ahsan** and **Farhan** (employees,
work the photobooths) and **Shahnawaz** (owner/admin). It replaces manual
WhatsApp-message-style daily reporting with a structured form.

**Employees use it to:**
- Clock in/out for their shift
- Log daily print counts and money collected at whichever venue they worked
- Log reimbursable expenses (petrol, food, misc costs paid out of pocket)

**The owner uses it to:**
- See attendance (auto-derived from submitted shifts, manually correctable)
- See a monthly financial picture (revenue, expenses, net profit)
- Review and approve reimbursements owed to each employee
- Browse a log of every submitted shift entry

**Explicitly NOT in scope for this build:**
- Real Supabase Auth / per-user accounts — login is name + 4-digit PIN,
  checked server-side
- Push notifications (e.g. "Ahsan clocked in") — flagged for a later phase,
  needs real backend infra beyond what we're building now
- Lunaro OS integration — future phase, not now
- Multi-business / multi-tenant anything — this is for Lunaro only

---

## Reference Material — How to Use It

A prototype exists (`Lunaro_Ops.html`, built in a different visual-design
tool) that shows the validated screens, copy, and field layout. It is
**reference for visuals and UX tone only.**

Do NOT attempt to parse, import, or "fix" that file directly — it's a
proprietary bundler format (base64-packed assets + an escaped JS string
inside script tags) not meant for direct editing or reuse as source code.
Rebuild every screen as a real Next.js component, using the prototype only
to see what the screens should look like and how they should feel.

If the prototype's logic conflicts with what's written in this document or
in a phase prompt, **this document and the phase prompts win.** The
prototype had some known issues; treat it as a rough visual reference, not
a spec.

---

## Tech Stack (locked)

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 14+ (App Router) | TypeScript strict mode |
| Database | Supabase (Postgres) | Schema is locked — see below |
| Hosting | Vercel | Connected to GitHub repo |
| Auth | None (custom PIN check) | No Supabase Auth. PINs bcrypt-hashed, verified server-side via API route |
| Styling | Tailwind CSS | Design tokens below |
| File storage | Supabase Storage | Used only for reimbursement receipt photos |
| Repo | github.com/ShahnawazYasser/Lunaro-Ops-App | |

**TypeScript strict mode. Zero `any` types anywhere.** Run `npx tsc --noEmit`
after every change — it must return zero errors before a task is done.

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=https://ybovehabxjjomurhqnlm.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<set in Vercel / .env.local, never commit>
SUPABASE_SERVICE_ROLE_KEY=<server-only, never exposed to client, never commit>
```

The publishable key is client-safe (RLS locks down what it can touch — see
schema notes). The service role key is server-only and must never appear in
any client-side bundle or be logged anywhere.

---

## Database Schema (locked — do not redesign)

Full SQL lives in `supabase_schema.sql` at the repo root (or will be added
in Phase 1). Summary of the tables and why they're shaped this way:

### `users`
Three rows: Ahsan (employee), Farhan (employee), Owner (owner). PIN stored
as a bcrypt hash, never plain text, never sent to the client. PINs:
Ahsan `8776`, Farhan `2537`, Owner `1200` — these get hashed by a seed
script, not hardcoded anywhere as plaintext in the app.

### `venues`
Static reference table, publicly readable (only table with an open RLS
policy). Rows: `tc` (Third Culture — Model Town), `solos` (Solos — Y Block),
`lanes` (Lanes Mall — Gulberg), `event` (Event — name entered freeform).

### `shift_entries`
One row per employee per date (`unique(user_id, entry_date)`). This is the
core daily log. Submitting one of these for today is what marks that
employee **present** for attendance purposes, unless overridden.

Fields and how they affect money:
- `total_prints` — billed at PKR 500 each
- `extra_prints` — billed at PKR 250 each
- `system_prints_500` / `system_prints_250` — manually-printed-outside-the-
  booth-app prints, split by which rate the employee charged the customer
- `free_prints` — **tracking only, never multiplied into revenue**
- `waste_prints` — **tracking only, never multiplied into revenue**
- `cash_received` / `bank_received` — what was actually collected
- `clock_in` / `clock_out` — used to compute hours worked

**Revenue formula (do not deviate from this):**
```
expected = (total_prints × 500) + (extra_prints × 250)
         + (system_prints_500 × 500) + (system_prints_250 × 250)
```
Free and waste prints are NEVER subtracted from anything. They exist purely
so the owner can see how many were given away or wasted.

### `entry_expenses`
Child table of `shift_entries` (foreign key, cascade delete). Operational
costs incurred that day (fuel, props, snacks). These reduce that day's net:
```
net = (cash_received + bank_received) − sum(entry_expenses.amount)
```

### `reimbursements`
Independent table, NOT linked to a specific shift entry. Money the company
owes an employee back — petrol, food, misc costs they personally paid.
Category is one of `Petrol` / `Food` / `Misc`. Optional receipt photo,
stored in Supabase Storage, URL saved on the row.

**Do not confuse this with `entry_expenses`.** Operational expenses reduce
that day's revenue net. Reimbursements are a liability owed to an employee
— a completely separate concept, even though both are "PKR an employee
logged."

### `attendance_overrides`
Attendance is **derived**, not stored directly:
- Present = a `shift_entries` row exists for that user+date, UNLESS
  overridden
- An override row (owner-only, manually set) can force present→absent or
  absent→present for a specific date
- If an override row exists at all for a date, the UI should visually mark
  that cell as "edited," regardless of which direction it was overridden

---

## Design System

```
Background:     #0B1929  (midnight navy)
Card surface:   #16293D
Border:         rgba(200,212,224,0.12)
Gold accent:    #C9A84C   (primary actions, totals, active states)
Text primary:   #E8EFF5   (silver-white)
Text secondary: #8A9BAD
Success:        #4AC47A
Danger:         #C45A4A
```

- Mobile-first for employee-facing screens (they fill this in on their
  phones at the booth). Desktop-friendly for owner dashboard/attendance
  views, which are denser.
- System UI / Segoe UI / system sans font stack — no custom font loading.
- Currency always formatted as `PKR 1,200` — never `$`.
- Large touch targets, plain-language labels. **The employees using this
  are not highly technical — avoid jargon.** Don't say "variance" or
  "reconciliation" — say things like "should have collected" / "difference."
- Premium, minimal, dark. Not playful, not corporate-bland.

---

## How Claude Code Must Work On This Project

These are non-negotiable working preferences:

### Phased build, one phase at a time
This project is being built in 5 phases, handed off as separate prompts.
**Do not jump ahead to a later phase's scope, even if it seems efficient.**
Each phase ends with a "STOP HERE" checkpoint — finish exactly what that
phase asks, report back clearly, and wait for the next prompt.

### Before writing any code
- Read this file in full first.
- If continuing from a prior phase, read the actual current state of the
  relevant files before changing them — don't assume what's there based on
  what an earlier phase prompt asked for. Verify, then edit.

### Quality bar
- TypeScript strict, zero `any` types, `npx tsc --noEmit` clean before
  calling anything done.
- Don't add features that weren't asked for in the current phase, even if
  they seem like obvious next steps. Flag them instead, don't build them.
- If something in this document or a phase prompt seems wrong, contradicts
  itself, or conflicts with the reference prototype, **stop and flag it**
  rather than silently picking an interpretation and proceeding.

### QA responsibility
- Act as a senior engineer reviewing your own work before handing it back.
- After finishing a phase, state plainly what should now work, and exactly
  what Shahnawaz should test to confirm it (specific actions, specific
  expected results) — not just "it should work now."

### Scope discipline
- Don't touch files outside what the current phase requires.
- Don't refactor unrelated code "while you're in there."
- Don't deploy to Vercel until Phase 5 explicitly says to.

---

## Current Build Status

_(Update this section at the end of every phase before ending the session.)_

**Last updated:** Phase 5 complete (code-side) — 2026-07-01. Awaiting live
Vercel URL and Shahnawaz's go-live confirmation.

### Completed

**Phase 1 — Foundation**
- Next.js 16 (App Router, TypeScript strict, Tailwind v4) scaffolded
- `@supabase/supabase-js`, `bcryptjs`, `tsx`, `dotenv-cli` installed
- `lib/supabase/client.ts` — browser Supabase client (anon/publishable key)
- `lib/supabase/server.ts` — server-only admin client (service role key, bypasses RLS)
- `lib/supabase/types.ts` — full typed Database schema (Supabase v2 format)
- `supabase_schema.sql` — complete schema ready to run (see instructions below)
- `scripts/seed.ts` — one-time user seed, run with `npm run seed`
- `app/api/health/route.ts` — GET /api/health proves Supabase connectivity
- Tailwind v4 design tokens set via `@theme` in `app/globals.css`
- `.env.local.example` — env var template (never commit `.env.local`)
- `npx tsc --noEmit` → zero errors

### Schema: manual steps required

The Supabase MCP server was not connected during Phase 1, so the schema
could not be applied automatically. You must run `supabase_schema.sql`
manually:

1. Go to https://supabase.com/dashboard/project/ybovehabxjjomurhqnlm/sql
2. Open `supabase_schema.sql` from this repo
3. Paste the full contents and click Run
4. Confirm all 5 tables created: `users`, `venues`, `shift_entries`,
   `entry_expenses`, `reimbursements`, `attendance_overrides`

### Seed users: manual steps required

After the schema is applied:
1. Copy `.env.local.example` → `.env.local` and fill in the keys
2. Run: `npm run seed`
3. Check Supabase dashboard → Table Editor → `users` — should show 3 rows

**Phase 2 — Login + Daily Entry**
- `/login` — name picker (Ahsan / Farhan / Owner) + 4-digit PIN pad (auto-submits on 4th digit)
- `POST /api/auth/login` — bcrypt verify, sets HS256 JWT in httpOnly cookie (7-day expiry)
- `POST /api/auth/logout` — clears session cookie
- `lib/session.ts` — JWT helpers (server + middleware)
- `middleware.ts` — protects all page routes, redirects unauthenticated to /login
- `/entry` — full daily shift entry form with live PKR summary
- `POST /api/entries` — upserts shift_entry (insert or update by user+date), replaces expenses
- Revenue formula implemented exactly per spec
- New env var: `SESSION_SECRET` (32+ char string for JWT signing)

**Phase 3 — Reimbursements + Attendance + Bottom Nav**
- `components/BottomNav.tsx` — sticky bottom nav; 2-tab for employees, 4-tab for owner
- `/reimburse` — expense log form (category, amount, venue, date, note, optional receipt photo upload to Supabase Storage `receipts` bucket); filtered list with month switcher + employee filter chips; total-owed per employee (pending+approved, not paid); status badges
- `/attendance` — owner-only; horizontally scrollable monthly grid with sticky name column + sticky days-count column; tap to toggle present/absent (optimistic); gold border on overridden cells; month switcher in header
- `GET/POST /api/reimbursements` — list (filtered by month + userId, joins users+venues) + insert
- `POST /api/reimbursements/upload` — receipt upload to Storage, validates type + 5 MB limit
- `GET /api/attendance` — owner-only, derives present/absent/future per employee per day with override resolution
- `POST /api/attendance/override` — owner-only check-then-upsert attendance_overrides
- `lib/supabase/types.ts` — updated reimbursements type with `expense_date` + `venue_id`
- Schema migration: added `expense_date date`, `venue_id text` columns to `reimbursements`; created `receipts` Storage bucket (public, 5 MB)
- PR: https://github.com/ShahnawazYasser/Lunaro-Ops-App/pull/1 (phase-3 → develop)

**Phase 4 — Owner Dashboard + Entries Log**
- `GET /api/dashboard?month=` — owner-only; returns total revenue (cash+bank across the month's shift_entries), operational expenses (entry_expenses tied to those shifts), reimbursements (by `expense_date` in month, all statuses), net profit, free/waste print totals, revenue+shift count by venue, and attendance summary (days present per employee, reusing the same derivation rules as `/api/attendance`: present = shift exists, unless an override says otherwise)
- `/dashboard` — owner-only; month switcher, net profit hero card, stat cards (revenue, opex, reimbursements, free prints + estimated cost @ PKR 500, waste prints), revenue-by-venue list, attendance summary list
- `GET /api/entries?month=` — owner-only; added to existing `app/api/entries/route.ts` (which already had POST); lists all shift entries for the month, most recent first, joined with employee + venue names and nested expenses
- `/entries` — owner-only; month switcher, per-entry cards showing employee, venue/event, date, hours worked (derived from `clock_in`/`clock_out`), total prints, free prints, amount received, net (received − that entry's own expenses)
- Bottom nav "Dashboard" and "Entries" tabs (already present in `components/BottomNav.tsx` from Phase 3) now resolve to real pages
- Added empty-state messaging for the venue dropdown on `/entry` and `/reimburse` when no venues are configured (previously just rendered an empty `<select>`)
- `npx tsc --noEmit` → zero errors

### Bug found and fixed during Phase 4
While building `/api/entries`, found that the month's end-date was computed as
`new Date(year, month, 0).toISOString().split("T")[0]` — this converts a
*local* midnight timestamp to UTC before slicing the date, which silently
shifts the date back a day in any timezone ahead of UTC (the dev/prod server
runs in `Asia/Karachi`, UTC+5). In practice this dropped every shift entry
dated on the last day of the month from the entries list. Caught it because
a real June 30 test entry was missing from `/api/entries?month=2026-06`
despite showing up correctly in `/api/dashboard` (which built the date
string manually instead of round-tripping through `Date`/`toISOString`).
Fixed in the new `/api/entries` route by computing `endDate` as a plain
string, matching the safe pattern already used in `/api/attendance`.

**The identical pattern exists in `app/api/reimbursements/route.ts`
(Phase 3, untouched in this phase)** — its `endDate` is computed the same
buggy way, so any reimbursement logged on the last calendar day of a month
will silently disappear from that month's list and totals (including the
"owed per employee" figures on `/reimburse`). No reimbursements were logged
on a month-end date yet, so this hasn't surfaced in testing — but it will.
Flagging per the "stop and flag conflicts" rule rather than fixing it
silently, since `/reimburse` is outside Phase 4's scope. Recommend a
one-line fix in a future phase: replace
`new Date(Number(year), Number(mon), 0).toISOString().split("T")[0]` with
the manual `${year}-${mon}-${String(daysInMonth).padStart(2,"0")}` string
construction used everywhere else.

### Small fix — between Phase 4 and Phase 5
Two UX issues found during Phase 4 testing, fixed before starting Phase 5:

1. **Logout was only reachable from `/entry`.** Moved the sign-out control
   into `components/BottomNav.tsx` — the one piece already rendered on
   every authenticated screen (`/entry`, `/reimburse`, `/attendance`,
   `/dashboard`, `/entries`) — as an extra item alongside the role-based
   nav tabs. Removed the old header logout button + handler from
   `app/entry/EntryClient.tsx` so there's a single source of truth.
2. **Post-login landing page was hardcoded to `/entry` for every role.**
   Fixed at the actual redirect point: `middleware.ts` now sends an
   authenticated user hitting `/login` or `/` to `/dashboard` (owner) or
   `/entry` (employee) based on `session.role`, instead of always `/entry`.
   `app/login/LoginClient.tsx` now hard-redirects to `/` after a successful
   PIN check (was hardcoded to `/entry`) so middleware's role logic always
   runs. Also fixed the same hardcoded fallback in `app/page.tsx`'s direct
   `redirect()` call, since it's the same redirect chain and middleware's
   own comment notes it's meant as a backstop, not the primary path.
- `npx tsc --noEmit` → zero errors

**Phase 5 — Deploy and Harden**
- **Vercel deployment**: connected via the Vercel dashboard (not the CLI) —
  GitHub repo imported as a new Vercel project, the three env vars
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`) set in Project Settings → Environment
  Variables, never committed to the repo. Production build (`next build`)
  verified clean with zero errors before connecting.
- **Mobile QA at 375px** (iPhone SE-class): tested every Phase 2–4 screen —
  `/login`, `/entry`, `/reimburse` (both roles), `/attendance`, `/dashboard`,
  `/entries` — in a real 375×700 viewport. One real layout bug found and
  fixed: `components/BottomNav.tsx` had 5 equal-width flex items for the
  owner role (4 nav tabs + the Phase-4.5 "Sign out" button), which crowded
  labels at 375px. Fixed by making sign-out a compact icon-only button
  (fixed width, left border divider) instead of a flex-1 item, so the 4 nav
  tabs keep their full label width. Added `truncate` as a safety net on nav
  labels. Everything else (forms, cards, attendance grid, stat grids) held
  up with no changes — they were already built mobile-first in Phases 2–4.
- **Error handling**:
  - Found and fixed a real silent-failure bug in `ReimburseClient.tsx`'s
    `fetchList()` — it had a `try/finally` with no `catch` and no `else`
    branch for a non-OK response, so a failed or network-erroring fetch
    just left the list looking empty with zero indication anything went
    wrong. Now sets a `listError` state with a message and a "Try again"
    button.
  - Added a "Try again" retry button (re-runs the same fetch with current
    month/filter state) to the existing error banners on `/dashboard`,
    `/entries`, and `/attendance` — they showed an error message before but
    had no explicit retry affordance.
  - `EntryClient.tsx`: added field-level inline validation — print-count
    and money fields can't be negative; submitting with a negative value
    shows a red border + "Can't be a negative number" under the specific
    field and blocks the request (previously `parseNum()` silently
    clamped negatives to 0 with no feedback).
  - `ReimburseClient.tsx`: amount field now shows the same kind of inline
    error (negative / zero / blank) instead of only a toast.
- **Session hardening**: `components/BottomNav.tsx` now also runs a
  30-minute idle timer (resets on tap/key/scroll) that auto-signs-out —
  hardens the "phone left logged in as Owner" risk beyond just having a
  manual sign-out button.
- **Copy pass**: read through all employee-facing copy. Found two spots in
  `EntryClient.tsx` using "revenue" inconsistently with the rest of the
  form's plain-language style ("money collected" is used everywhere else)
  — reworded both. No other technical jargon found; the existing Phase 2–3
  copy was already in good shape (e.g. "Should have collected" / "Difference"
  instead of "variance"/"reconciliation", per the original spec).
- `npx tsc --noEmit` → zero errors. `npm run build` → zero errors.
- **Live URL**: `<TBD — fill in once the Vercel project is connected>`

### In progress
- Nothing code-side. Awaiting the live Vercel URL from Shahnawaz to finish
  the CLAUDE.md update, then his go-live confirmation per the Phase 5 stop.

### Known issues
- See "Bug found and fixed during Phase 4" above — `/api/reimbursements`
  has an unfixed, latent month-end date bug (same fix pattern as the one
  already applied to `/api/entries`).

### Next phase
- Not yet defined — this is the go-live checkpoint. Do not treat this as
  the version staff use day to day until Shahnawaz confirms.

---

## Architecture Summary (as of Phase 5)

- **Framework**: Next.js 16 (App Router), TypeScript strict (`npx tsc --noEmit`
  must be zero errors), Tailwind v4. Hosted on Vercel, deployed from the
  `master` branch (GitHub-connected; pushes to `master` auto-deploy).
- **Auth**: no Supabase Auth — name + 4-digit PIN, bcrypt-hashed, checked
  server-side in `app/api/auth/login/route.ts`. Session is an HS256 JWT in
  an httpOnly cookie (`lib/session.ts`, 7-day expiry), checked on every page
  route by `middleware.ts`. A 30-minute client-side idle timer
  (`components/BottomNav.tsx`) auto-signs-out on top of the manual button.
- **Database**: Supabase Postgres (`supabase_schema.sql`). All reads/writes
  go through `supabaseAdmin` (service-role key, server-only,
  `lib/supabase/server.ts`) inside API routes — RLS policies exist as a
  backstop, not as the primary access-control layer; that layer is the
  session check + role check in each route handler.
- **Routing / access control**: `middleware.ts` redirects unauthenticated
  users to `/login` and routes authenticated landings by role (`owner` →
  `/dashboard`, `employee` → `/entry`). Owner-only pages
  (`/dashboard`, `/attendance`, `/entries`) redirect employees to `/entry`
  at the page level and return 403 at the API level — both layers exist
  independently, neither depends on the other.
- **Money model**: `expected = total_prints×500 + extra_prints×250 +
  system_prints_500×500 + system_prints_250×250` (never used for actual
  revenue, only as a "should have collected" comparison). Actual revenue =
  `cash_received + bank_received`. Entry-level net = revenue −
  `entry_expenses` for that shift. Dashboard net profit = month's total
  revenue − that month's `entry_expenses` − that month's `reimbursements`
  (by `expense_date`, all statuses). Free/waste prints are tracking-only,
  never multiplied into any money figure.
- **Screens**: `/login` (PIN), `/entry` + `/reimburse` (employee + owner,
  role-aware), `/attendance` + `/dashboard` + `/entries` (owner-only).
  `components/BottomNav.tsx` renders the role-appropriate tab set plus
  sign-out on every authenticated screen.
- **Live URL**: `<TBD — fill in once the Vercel project is connected>`

## Adding a New Employee

There's no self-service signup — users are seeded via `scripts/seed.ts`,
which is safe to re-run (it upserts: updates the PIN hash if a user with
that name already exists, inserts if not — won't touch or duplicate Ahsan,
Farhan, or Owner).

To add someone new:
1. Open `scripts/seed.ts` and add a row to the `USERS` array, following the
   existing Ahsan/Farhan entries — `{ name: "...", role: "employee", pin: "...." }`
   (4-digit PIN, plaintext here only because the script hashes it on insert
   — never commit a real PIN anywhere else).
2. Run `npm run seed` with `.env.local` pointed at the **production**
   Supabase project (same `NEXT_PUBLIC_SUPABASE_URL` /
   `SUPABASE_SERVICE_ROLE_KEY` as set in Vercel). This is a local-machine
   step — there's no admin UI for it.
3. Tell the new employee their name (exactly as seeded) and PIN — they log
   in the same way Ahsan and Farhan do, no account creation on their end.
4. Optional cleanup: remove the temporary plaintext PIN from `USERS` after
   confirming the login works, if you don't want it sitting in git history
   going forward (it's already hashed in the database at that point).
