# Lunaro Ops App — Project Context for Claude Code

> Read this file in full before doing anything. The phase-by-phase history lives in
> `docs/BUILD_LOG.md` (read it only when you need the "why" behind a rule). At the end of
> every chunk, append an entry to the build log and keep "What exists" and the schema below current.

## Who and what
**Builder:** Shahnawaz Yasser, Lahore. Founder of Lunaro (photobooth business + SaaS). Direct, zero fluff, technical;
quality over speed; root-cause fixes; state tradeoffs plainly (cost, risk, complexity). Not highly technical staff use
the app — no jargon in copy ("should have collected" / "difference", never "variance" / "reconciliation").

**App:** internal tool for a small team (employees Ahsan, Farhan, Amnah; owner Shahnawaz) replacing WhatsApp daily
reports. Employees log shifts (prints, cash/bank collected, shift costs) and out-of-pocket expenses. The owner sees
attendance, entries, money in/out, bookings, payouts, assets, fixed costs, draws and a monthly dashboard.
**Not in scope:** Supabase Auth, push notifications, Lunaro OS integration, multi-tenant anything.
`Lunaro_Ops.html` (prototype) is visual reference only — never parse or import it; this file wins on conflicts.

## Tech stack (locked)
Next.js 16 App Router (Turbopack), TypeScript strict, Tailwind v4 · Supabase Postgres (service-role key from API
routes/pages only) · Vercel (pushes to `master` auto-deploy; Vercel CLI/MCP auth is broken, so infer live state from
behaviour) · Supabase Storage (private `receipts` bucket) · repo github.com/ShahnawazYasser/Lunaro-Ops-App.
**Zero `any`.** `npx tsc --noEmit`, `npm run lint` and `npm run build` must all be clean before anything is done.
(If `tsc` complains about `.next/types` after moving routes, delete `.next`.)

## Environment
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-only, never logged/committed), `SESSION_SECRET` (≥32
chars, enforced), `SEED_USERS` (seed script only), `ALLOWED_DEV_ORIGINS` (dev LAN hosts). No browser Supabase client.
Receipts: `expenses.receipt_url` holds a storage path; opened via `GET /api/expenses/[id]/receipt` (60 s signed URL;
legacy full URLs still resolve; uploads are type- and magic-byte-checked, 5 MB). **There is no dev database** — `.env.local` points at production. Assume every write
is real: ask first, use far-future dates and a "TEST" description, delete afterwards.

## Database (current — source: `db/supabase_schema.sql`; migrations: `db/migration_*.sql`)
Notation: `col type [flags] — note`. RLS is on everywhere; only `venues` has a public-read policy. All access is via
`supabaseAdmin` after a session check.
```
users            id uuid pk · name text unique · role 'employee'|'owner' · pin_hash text (bcrypt, never sent) ·
                 created_at · active bool · must_set_pin bool · pin_changed_at · session_version int
venues           id text pk ('tc','solos','lanes','event',…) · name · location · active bool ·
                 collects_payments bool (venue collects the money and pays us out: Lanes) · default_price numeric(8,2)
shift_entries    id · user_id→users · entry_date · venue_id→venues · UNIQUE(user_id,entry_date,venue_id)
                 total_prints (×500) · extra_prints (×250) · system_prints_500 · system_prints_250 ·
                 free_prints / waste_prints (tracking only) · cash_received · bank_received numeric(10,2) ·
                 clock_in time · clock_out time · event_name · notes (≤300) · created_at · updated_at ·
                 cash_collected bool · cash_collected_at · last_edited_by→users · last_edited_at ·
                 price_charged numeric(8,2) (informational, never revenue)
expenses         id · expense_date · category text (app-enforced) · amount >0 · description (nullable) · receipt_url ·
                 paid_by 'company'|'employee' · payer_user_id→users · reimbursement_status 'pending'|'paid' ·
                 related_user_id→users (who it is about) · shift_entry_id→shift_entries (cascade) · venue_id→venues ·
                 logged_by→users · created_at · updated_at · is_owner_draw bool · recurring_id→recurring_expenses ·
                 recurring_month date. CHECK expenses_payer_consistency; UNIQUE(recurring_id,recurring_month)
recurring_expenses id · name · category · amount>0 · due_day 1–28 (informational) · venue_id→venues · active ·
                 starts_on · ends_on
attendance_overrides id · user_id→users · override_date · is_present · created_by→users · created_at · UNIQUE(user_id,override_date)
bookings         id · client_name · event_name · package · amount_charged>0 · event_date · notes ·
                 advance_amount>0 + advance_date (both or neither) · final_amount>0 + final_date (both or neither) ·
                 status 'upcoming'|'completed'|'cancelled' (only 'cancelled' is read) · created_by→users · created_at · updated_at
assets           id · name · cost>0 · purchase_date · useful_life_months>0 · salvage_value · venue_id→venues · created_at
payout_cycles    id · venue_id→venues · cycle_start · cycle_end · gross_amount · rent_deducted · received_on +
                 received_amount (both or neither) · payout_due date (entered by hand, never computed)
entry_audit      id bigserial · entry_id uuid (no FK, survives delete) · entry_date · actor_id→users ·
                 action 'insert'|'update'|'delete' · changed jsonb {field:{from,to}} · was_collected bool · created_at
login_attempts   name · attempted_at · ip   (no primary key yet — see db/migration_tidy.sql)
reimbursements_legacy / entry_expenses_legacy   read-only copies from Phase D, unused; drop after a CSV export
view asset_depreciation(asset_id, name, month, amount)  straight-line monthly slice, security_invoker
functions        set_updated_at() · replace_entry_expenses(shift_id, jsonb) · save_shift_entry(entry jsonb, expenses jsonb, id)
                 (shift row + expenses in ONE transaction) · log_entry_change() (audit trigger on shift_entries;
                 actor from the `x-actor-id` header set by supabaseAsActor)
```

## Design system
Background `#0B1929`, card `#16293D`, border `rgba(200,212,224,.12)`, gold `#C9A84C` (primary/totals/active), text
`#E8EFF5` / secondary `#8A9BAD`, success `#4AC47A`, danger `#C45A4A`. Premium, minimal, dark. Mobile-first for staff
screens, denser on desktop for the owner. Currency is always `PKR 1,200` (`pkr()` in `lib/format.ts`), never `$`.
Fonts: Bricolage Grotesque (display) + Hanken Grotesk (body) via `next/font/google` only — **load Hanken without an
explicit `weight` list** (it breaks Turbopack dev). `.glass` must stay inside `@layer components` (unlayered it overrides
`fixed`/`absolute`). Build UI from `components/*` (Button, Card, Badge, FormField…); no inline hex/colour styles.
**Vocabulary rule:** never show internal names ("reimbursement status", `paid_by`…). Say "Who paid?", "Owes {name}",
"Paid back", "Waiting". Touch targets large; plain labels.

## How to work here
- One chunk at a time; stop at each checkpoint and report. Don't build unrequested features — flag them. If a prompt or
  this file looks wrong or contradictory, stop and say so rather than guessing.
- Read the actual current files before editing; confirm one thing works before the next. Review your own work like a senior
  engineer; finish by stating what should work and exactly what Shahnawaz should test (actions + expected results).
- Stay in scope: don't touch unrelated files or refactor "while you're in there". Commit/merge/deploy only when asked
  (merging to `master` deploys). Work on a `chunk-*` branch.
- Every read-only claim needs evidence; write tests against production only with the rules in "Environment".

## Architecture
- **Routing:** `app/(app)/` is the route group for every signed-in screen; `app/(app)/layout.tsx` checks the session once
  and renders `components/AppShell.tsx` (floating sidebar ≥1024px, bottom bar + "More" sheet below, 30-min idle sign-out,
  page padding). `/login` and `/set-pin` live outside the group (full-screen keypads; a temporary-PIN user must reach
  `/set-pin` with no nav). `app/(app)/loading.tsx` is the instant skeleton. Every page exports `preferredRegion = "sin1"`.
- **Data:** `lib/data/*.ts` own the GET queries (dashboard, entries/my-entries, expenses, attendance, payouts, assets,
  bookings). Routes and pages both call them — never duplicate a query. They throw `DataError`; routes map it with
  `dataError()`. Pages load the first screenful on the server and pass `initial` + `initialMonth` to the client.
- **Client cache:** `lib/useMonthData.ts` (keys `"<screen>:<month>[:<filter>]"`; seed, `refresh`, `setData`, `invalidate`,
  `prefetch`; browser-only store). **Any save/delete must `invalidate` the other screens it affects** — anything touching
  money or entries invalidates `"dashboard:"`. Data-fetch effects go through `lib/defer.ts` (lint rule
  `react-hooks/set-state-in-effect`).
- **Auth/guards:** name + PIN (bcrypt cost 12, 4–8 digits, `lib/pin.ts` rejects repeats/straight runs). `lib/api.ts`:
  `requireSession`/`requireOwner`/`fail`/`dbError`/`dataError` guard every route under `app/api/**`; **never return
  `error.message` to a client**. Sessions are HS256 JWTs (owner 12 h, staff 7 d) carrying `sv`; `getVerifiedSession()`
  (`lib/auth.ts`, React-`cache`d) checks the database every time — **role comes from the DB, never the token**; pages use
  it, not `getSession`. `mustSetPin` users can only reach `/set-pin` and `POST /api/auth/set-pin`. Deactivating or
  resetting a PIN bumps `session_version` (signed out everywhere). Login: one "Wrong name or PIN" message, 5/15 min per
  name+IP and 20/15 min per name. `middleware.ts` also holds an early owner-only page list (real 307); pages' own DB
  check stays the authority — keep both lists in step. Its matcher must keep excluding PWA assets (manifest, sw.js, icons).
- **Validation:** `lib/validate.ts` (`isIsoDate`, `isTime`, `int`, `money`, `str`, `isUuid`, `isMonth`) and
  `lib/entry-input.ts` (shared parser for entry POST/PUT). Security headers + CSP in `next.config.ts`.
- **Dates:** `lib/dates.ts` is the only place for date maths (`monthRange`, `todayInKarachi`, `currentMonthInKarachi`,
  `shiftMonth`, `addDays`, `formatDate`, `hoursWorked`). **Never** `new Date().toISOString().split("T")` and never the
  device clock for "today"/"this month" (everything is Asia/Karachi; UTC slicing lost month-end days). Overnight shifts
  add 24 h; >16 h or equal times are rejected ("Check the times"). `lib/format.ts` has `pkr`/`plural`.
- **Attendance:** present = a shift row exists, unless an override row says otherwise; future days are "future". Only
  `lib/attendance.ts` `deriveAttendance` implements this. An override row marks the cell "edited" either way.
- **PostgREST embeds:** any table with several FKs to `users` must pin the constraint in every embed
  (`users!shift_entries_user_id_fkey`, `users!expenses_payer_user_id_fkey`, …) or it fails with PGRST201. Audit every
  `select()` that embeds a table before adding a new FK to it.
- **PWA:** `public/sw.js` is hand-written (next-pwa needs webpack; this is Turbopack): cache-first only for
  `/_next/static/*`, the manifest/icons and script/style/font requests; **`/api/*` and pages are never intercepted**; no
  offline queue; registered in production only; served `no-cache`. Placeholder "L" icons await a real logo.

## Money and business rules (permanent contracts)
- **Shift money:** expected = `total×500 + extra×250 + sys500×500 + sys250×250` — only a "should have collected"
  comparison. Real shift revenue = `cash_received + bank_received`. Free/waste prints and `price_charged` never touch
  any money figure. Shift net = received − that shift's expenses.
- **Collected lock:** once `cash_collected` or `last_edited_by` is set, the employee path rejects changes (409 "This entry
  has been finalized by the owner. Contact them to make changes."). The owner `PUT /api/entries/[id]` is the sanctioned
  bypass (sets `last_edited_*`, never changes `entry_date`/`user_id`). `DELETE` is owner-only via `supabaseAsActor`.
- **Staff entries:** `POST /api/entries` without `entryId` creates (409 if user+date+venue exists); with `entryId` it
  edits their own unlocked row within 7 days (`EDIT_WINDOW_DAYS`). New entries: staff today or 2 days back, owner any
  past date, nobody the future. Staff `/entry` lists active, non-payout venues only. Each save goes through
  `save_shift_entry` (one transaction); shift expenses carry a category (`SHIFT_EXPENSE_CATEGORIES`, default Operational).
- **Expenses are one table.** Company-paid = normal cost; employee-paid = owed back until `paid` (two states only).
  Reimbursement is a property, not a table. **Accrual:** an expense counts in the month of `expense_date`; marking it
  paid never moves it. Categories live in `lib/categories.ts` (`CATEGORIES`, `EMPLOYEE_CATEGORIES`; no DB check).
  Employees only ever see/log their own employee-paid rows (server-enforced). Delete: staff only own pending rows;
  owner anything except shift-linked rows (those are edited through the entry).
- **Owner draws are not business costs.** `is_owner_draw = true`, category `'Owner Draw'` (deliberately not in
  `CATEGORIES`). Every P&L query excludes them; `/api/expenses` hides them; the dashboard reports them separately. Any
  new `expenses` query must decide explicitly about draws (almost always: exclude).
- **Bookings are cash-basis:** revenue for a month = advances dated in it + finals dated in it. Never `amount_charged`
  or `event_date`; cancelling doesn't remove money already received. Displayed status is derived (cancelled / past →
  completed / else upcoming). Staff must not also log booking money on a shift (policy, not code).
- **Payouts and rent:** `payout_due` is a manual date. Payout-venue revenue = `gross_amount` when received; rent comes
  out of whichever cycle it lands in (`rent_deducted`, counted once as an expense). A Rent expense row is skipped only
  when that venue had a payout received this month with rent deducted. The rent-coverage alert applies to recurring
  costs at `collects_payments` venues with no known `payout_due` in the month.
- **Fixed costs** (`recurring_expenses`, screen "Fixed costs") are templates. Nothing posts automatically: the owner
  presses "Count them" on the dashboard (`POST /api/recurring/post`), which posts one company expense per applicable
  cost dated the 1st; payout venues are never posted; repeats are skipped.
- **Dashboard:** `netProfit = totalRevenue − totalExpenses − depreciation`. `totalRevenue` = shift revenue + booking
  payments + payout gross; `totalExpenses` includes payout rent but excludes draws. `owedToEmployees` = all pending
  employee-paid rows in any month. Depreciation is a non-cash monthly slice of each asset. Revenue-by-venue, daily
  sales, expenses-by-category and per-day attendance come from the one `getDashboard` call.
- **Users:** managed on `/users` (add staff with a temporary PIN, reset, deactivate/reactivate; people are never deleted;
  you can't deactivate yourself or the last owner). First sign-in forces `/set-pin`. Deactivated staff still appear in
  months where they have entries. `scripts/seed.ts` is only for the very first owner or recovery; never write a PIN in
  the repo or paste one anywhere.

## What exists (screens)
1. `/login`, `/set-pin` — PIN pad; forced PIN choice; voluntary change asks for the current PIN.
2. `/entry` — staff shift form (live PKR summary, shift expenses with categories, notes, price charged).
3. `/my-entries` — own entries by month, cash still held, collected state, edit within 7 days.
4. `/reimburse` ("My Expenses") — staff out-of-pocket expenses, receipts, delete while Waiting.
5. `/dashboard` — owner month view: net profit, revenue/expense mix, owed to staff, draws, rent alert, "Count them".
6. `/entries` — owner log: detail, cash-collected toggle, edit, delete, change history.
7. `/expenses` — owner money-out: log, filter, mark paid back, delete.
8. `/attendance` — derived present/absent with owner overrides.
9. `/bookings` — paid client events (advance/final payments, cancel, edit, delete).
10. `/payouts` — venue payout cycles (Lanes): gross, rent deducted, received, manual due date.
11. `/assets` — equipment with straight-line depreciation. 12. `/recurring` — fixed costs. 13. `/draws` — owner draws.
14. `/users` — add/reset/deactivate staff. Shared UI in `components/`; one shell (`AppShell`); forms shared
    (`ShiftEntryForm`, `BookingForm`, `ExpenseForm`, `ExpenseList`). Open work: none queued — wait for a prompt
    (Google Calendar sync for bookings and the Lunaro OS integration are deferred).
Live: https://lunaro-ops-app.vercel.app. Migrations live in `db/`; `db/migration_tidy.sql` is written but NOT applied.
