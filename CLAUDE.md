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

**Last updated:** PWA Part 3 of 3 partially verified — 2026-07-01. Phase 5
(deploy + harden) is done and live. PWA support (manifest/icons, service
worker, and this final verification pass) is code-complete, but Part 3's
real-device checks (phone install, visual browser regression) still need
Shahnawaz to run them — see "In progress" below. Still awaiting
Shahnawaz's go-live confirmation before staff use this day to day.

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
- **Live URL**: https://lunaro-ops-app.vercel.app

**PWA Support — Part 1 of 3 (Manifest + Icons)**
- Web-based PWA (Option A), not a native app rebuild. Purely additive —
  no functional behavior changed; app works exactly as before.
- `public/manifest.json` — name/short_name "Lunaro Ops", `background_color`
  and `theme_color` both `#0B1929`, `display: "standalone"`, `start_url: "/"`
  (routes through the existing role-based redirect in `middleware.ts`,
  unchanged)
- `public/icons/icon-192.png`, `icon-512.png` (purpose `any`),
  `icon-512-maskable.png` (purpose `maskable`, mark shrunk to fit the safe
  zone) — **placeholder icons only**: a gold (`#C9A84C`) "L" mark on the
  navy (`#0B1929`) background, generated by a one-off pixel-level PNG
  encoder script (no image libraries added as dependencies). **Shahnawaz
  should swap these for a real logo whenever he has one** — no design
  effort was spent beyond a legible placeholder mark.
- `public/apple-touch-icon.png` (180×180, opaque background — iOS doesn't
  handle transparency on this icon) — same placeholder mark
- `app/layout.tsx` — added `manifest: "/manifest.json"` and
  `icons: { apple: "/apple-touch-icon.png" }` to the `metadata` export,
  plus a new `viewport` export with `themeColor: "#0B1929"`; Next's
  metadata API generates the actual `<link>`/`<meta>` tags from these
- No service worker, no caching, no offline behavior — explicitly out of
  scope for this part (that's Part 2)
- `npx tsc --noEmit` → zero errors. `npm run build` → zero errors.
- Files touched: `app/layout.tsx`, `public/manifest.json`,
  `public/icons/*`, `public/apple-touch-icon.png` only, per scope.

**PWA Support — Part 2 of 3 (Service Worker + Network-First API Caching)**
- **Library decision, flagged clearly**: did not use `next-pwa` (or its
  `@ducanh2912/next-pwa` fork). Both wrap `workbox-webpack-plugin`, which
  hooks into webpack's config — this app's `next build` runs on Turbopack
  (confirmed via the build output: `▲ Next.js 16.2.9 (Turbopack)`), and
  Turbopack does not run webpack plugins, so that dependency would
  silently produce no service worker at all in this project. Next.js
  itself has no built-in/official PWA feature as of 16.2.9. Given the
  caching rules required here are simple and exact (cache-first for a
  known, small set of static paths; everything else untouched), a
  hand-rolled service worker was used instead — no new dependency, full
  control, and it maps 1:1 onto the spec instead of fighting a
  webpack-oriented library's config format.
- `public/sw.js` — new service worker script:
  - Cache-first (cache `lunaro-shell-v1`) for `/_next/static/*` (Next's
    content-hashed build output — safe to cache indefinitely since a new
    deploy always uses new hashed filenames, so stale-JS-after-deploy
    isn't possible), plus the exact static paths from Part 1
    (`/manifest.json`, `/apple-touch-icon.png`, `/favicon.ico`, the three
    `/icons/*.png` files), plus any request whose `destination` is
    `script`/`style`/`font`
  - **Every other request is left completely unintercepted** — no
    `respondWith` at all, so it just hits the network normally. This
    covers every `/api/*` route (dashboard, entries, attendance,
    reimbursements, auth, health) and every page navigation (which are
    all server-rendered per-session/per-role, not static — caching HTML
    here would risk serving one user's dashboard number, or the wrong
    role's page, to someone else). This is stronger than "network-first"
    — it's network-only for these, so there's no cache to ever fall back
    to, stale or otherwise.
  - `activate` handler deletes any cache not named `lunaro-shell-v1`
    (hygiene, avoids unbounded growth across SW versions)
  - Explicitly does **not** implement offline queuing, background sync,
    or any "submit while offline" behavior — out of scope per the spec,
    and a real risk (double-submits) for a financial/attendance tool
- `components/ServiceWorkerRegister.tsx` — new client component, rendered
  once in `app/layout.tsx`; registers `/sw.js` via `useEffect`, gated to
  `process.env.NODE_ENV === "production"` only (registering in dev would
  cache fast-changing dev-server chunks and fight hot reload — standard
  practice, not scope creep)
- `next.config.ts` — added a `headers()` rule forcing
  `Cache-Control: no-cache` on `/sw.js` itself, so browsers always
  revalidate the service worker script with the server instead of
  long-caching it and never picking up future updates to its logic
- `app/layout.tsx` — one import + one `<ServiceWorkerRegister />` render;
  `public/manifest.json` and the Part 1 icons were **not** touched
- **Server-side verification done**: `npm run start` (production build)
  confirms `/sw.js` → `200`, `Cache-Control: private, no-cache, no-store,
  max-age=0, must-revalidate`; a real `/_next/static/chunks/*.js` →
  `200`, `Cache-Control: public, max-age=31536000, immutable` (confirms
  the cache-first assumption for build output is sound)
- `npx tsc --noEmit` → zero errors. `npm run build` → zero errors.
- Files touched: `public/sw.js` (new), `components/ServiceWorkerRegister.tsx`
  (new), `app/layout.tsx`, `next.config.ts`. Manifest/icons from Part 1
  untouched.

### Bug found and fixed during Part 2 browser verification
Shahnawaz tested Part 2 live and hit `Manifest: Line: 1, column: 1,
Syntax error` in the console. Root cause was not the manifest file itself
— it was `middleware.ts` (Phase 2, untouched since). Its route matcher
only excluded `api`, `_next/static`, `_next/image`, and `favicon.ico`;
everything else — including `/manifest.json`, `/sw.js`,
`/apple-touch-icon.png`, and `/icons/*` — was subject to the auth check.
Fetching `/manifest.json` while logged out (or on a fresh navigation) hit
the "no session → redirect to /login" branch and got back the `/login`
page's HTML, which the browser's manifest parser then tried to read as
JSON — hence "Line 1, column 1" (HTML starts with `<`, not `{`). This
silently affected `/sw.js` and the icons the same way; manifest parsing
is just the one that surfaces an error message.

Fixed by extending `middleware.ts`'s matcher to also exclude
`manifest.json`, `sw.js`, `apple-touch-icon.png`, and `icons/` — these
PWA assets must be fetchable unauthenticated. This touches a file outside
Part 2's declared scope (`middleware.ts`), flagged per the "stop and flag
conflicts" rule rather than left broken, since it directly blocked the
feature being verified. `npx tsc --noEmit` and `npm run build` stayed
zero errors after the fix.

**Verified live after the fix** (unauthenticated `curl`-equivalent
checks against `npm run start`): `/manifest.json` → `200`,
`Content-Type: application/json`, correct body; `/sw.js` → `200`,
`application/javascript`; `/icons/icon-192.png` and
`/apple-touch-icon.png` → `200`, `image/png`. None redirect to `/login`
anymore. Shahnawaz separately confirmed via DevTools → Application that
the service worker is `activated and is running`, `lunaro-shell-v1`
exists in Cache Storage, and a static chunk was served `(from disk
cache)` with the expected `immutable` header.

**PWA Support — Part 3 of 3 (Final Verification, Server-Side Only)**
Verification and cleanup only, no new features, per scope. Chrome MCP
was unreachable all session, so the real-device / real-browser checks
this part calls for could not be run by Claude — see "In progress"
below for exactly what's left and how to run it.

What was verified (against `npm run start`, a production build):
- `npx tsc --noEmit` → zero errors. `npm run build` → zero errors.
- **Role-based routing regression, all three users** (Ahsan, Farhan,
  Owner), scripted via `curl` with each user's real session cookie:
  landing redirect (`/` → `/entry` for employees, `/dashboard` for
  Owner), employee access to `/entry` and `/reimburse` (200), employee
  redirect away from owner-only pages `/attendance` `/dashboard`
  `/entries` (307 → `/entry`), owner-only API 403 for employees
  (`/api/attendance`, `/api/dashboard`, `/api/entries`), and full 200
  access for Owner across every page and API. No regressions found from
  the Part 1/2 PWA changes — this only proves server-side routing/auth
  is intact, not that every on-screen form/button still renders and
  behaves correctly (that needs a real browser, see below).
- **PWA asset routes re-confirmed** unauthenticated-accessible after
  Part 2's middleware fix (`/manifest.json`, `/sw.js`, icons all still
  200, not redirected).
- **Data freshness at the API layer**: fetched Dashboard's `netProfit`
  for July, submitted a new shift entry via the API, re-fetched
  Dashboard, confirmed the figure updated immediately (5,000 → 7,500,
  matching the entry's cash received) with zero caching interference.

**Important — this environment has no separate dev/staging Supabase
project.** `.env.local` points at the same `ybovehabxjjomurhqnlm`
project the live Vercel deployment uses. The data-freshness check above
wrote a real row (Ahsan, 2026-07-15, `tc`, PKR 2,500) into production to
prove the point, then deleted it via direct SQL once Shahnawaz confirmed
that was OK — verified `netProfit` reverted to 5,000 after cleanup. Any
future write-testing against this app should assume it's hitting real
data and ask before running, not after.

### In progress
- **Part 3's real-device checks were not run this session** (Chrome MCP
  unreachable) — these are what's actually left to close out PWA support:
  1. **Plain-browser regression** (not installed): log in as each of the
     three users in a normal browser tab, click through Entry, Reimburse,
     Attendance, Dashboard, Entries — confirm every form/button/live
     calculation still works exactly as before. (The server-side routing
     check above is a good proxy but doesn't exercise client-side
     rendering or interaction.)
  2. **Real phone install**: remove any existing home screen icon,
     re-add via "Add to Home Screen" so it picks up the final
     manifest + service worker, confirm the icon is correct, it opens in
     standalone mode (no browser address bar), and a second open feels
     noticeably faster than the first.
  3. **Data freshness from the installed app specifically**: open
     Dashboard on the installed app, note net profit, submit a change
     (from the same or another device), refresh, confirm the number
     updates. The API-layer check above proves the server side is
     correct; this proves the service worker itself doesn't intercept
     `/api/*` when running in real standalone mode.
  4. **Console check in the installed app**: DevTools (via `chrome://inspect`
     for an installed PWA, or Safari's remote inspector on iOS) — confirm
     no errors and no service worker registration failures.
- If anything turns up broken in the four checks above, fix it and
  re-verify — stay within "fix what Parts 1–2 broke," no new features.
- Core app is code-complete and live at https://lunaro-ops-app.vercel.app
  — awaiting Shahnawaz's go-live confirmation per the Phase 5 stop before
  treating this as the version staff use day to day.

### Known issues
- See "Bug found and fixed during Phase 4" above — `/api/reimbursements`
  has an unfixed, latent month-end date bug (same fix pattern as the one
  already applied to `/api/entries`).

### Next phase
- Finish the four outstanding Part 3 device checks above. Once confirmed,
  PWA support (all 3 parts) is fully closed out.
- Core app: go-live checkpoint still open — not yet defined as "next
  phase" until Shahnawaz confirms.

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
- **Live URL**: https://lunaro-ops-app.vercel.app

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
