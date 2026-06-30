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

**Last updated:** Phase 2 complete — 2026-06-30.

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

### In progress
- Nothing. Phase 2 is complete.

### Known issues
- None.

### Next phase
- Phase 3: Reimbursements screen + Owner attendance view.
