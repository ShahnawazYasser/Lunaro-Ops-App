import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError } from "@/lib/api";
import { isMonth } from "@/lib/validate";
import { supabaseAdmin } from "@/lib/supabase/server";
import { monthRange, todayInKarachi } from "@/lib/dates";
import { deriveAttendance } from "@/lib/attendance";

export const preferredRegion = "sin1";

export interface VenueRevenue {
  venueId: string;
  venueName: string;
  revenue: number;
  shiftCount: number;
  // Payout cycles received this month (venues that collect from guests
  // themselves and pay Lunaro, e.g. Lanes). 0 for booth-collected venues.
  payoutCycles: number;
}

export interface AttendanceDayStatus {
  date: string;
  status: "present" | "absent" | "future";
}

// Per-employee attendance for the month, derived by lib/attendance.ts — the
// same rule the Attendance screen uses, so the dashboard needs no second fetch.
export interface AttendanceSummaryRow {
  id: string;
  name: string;
  daysPresent: number;
  days: AttendanceDayStatus[];
}

export interface OwedByEmployee {
  userId: string;
  name: string;
  amount: number;
}

export interface CategoryExpense {
  category: string;
  amount: number;
}

// Rent-coverage warning (Chunk 4). Rent is not due on a fixed day of the
// month — it's deducted from whichever payout cycle it lands in (see
// migration_payout_due_manual.sql). An item is uncovered when the active
// recurring expense's venue has no payout_cycles row with a known
// (manually-entered) payout_due landing in the selected month.
export interface RentCoverageItem {
  venueName: string;
  rentAmount: number;
  nextPayoutDue: string | null;
}

export interface DashboardResponse {
  totalRevenue: number;
  totalExpenses: number;
  // ALL outstanding employee-paid expenses (reimbursement_status = 'pending'),
  // whatever month they were incurred in — money owed doesn't expire.
  owedToEmployees: number;
  owedByEmployee: OwedByEmployee[];
  netProfit: number;
  freePrintsCount: number;
  wastePrints: number;
  // Cash-basis booking revenue for the month (Phase F) — sum of advance/final
  // payments whose *payment date* falls in this month. amount_charged and
  // event_date play no role here. bookingPaymentsCount is just the number of
  // qualifying payments, for the "Client events" line's subtitle.
  bookingRevenue: number;
  bookingPaymentsCount: number;
  // Venue payout revenue (Chunk 7) — CASH BASIS on payout_cycles.received_on.
  // payoutRevenue is gross_amount (never received_amount, which is net of
  // rent); payoutRent is rent_deducted, counted once as an expense and shown
  // separately. payoutRevenue - payoutRent reconciles to the amount banked.
  // payoutRent is already inside totalExpenses but is NOT in
  // expensesByCategory (which only groups `expenses` rows).
  payoutRevenue: number;
  payoutRent: number;
  payoutCyclesPaid: number;
  // Straight-line depreciation for the month (Chunk 2) — a non-cash cost,
  // computed live from the asset_depreciation view. Only this month's slice
  // counts, never an asset's full cost. Included in netProfit alongside
  // totalExpenses.
  depreciation: number;
  revenueByVenue: VenueRevenue[];
  expensesByCategory: CategoryExpense[];
  attendance: AttendanceSummaryRow[];
  daysInMonth: number;
  rentCoverage: RentCoverageItem[];
  // "Booth sales by day" chart (Chunk 9): one entry per calendar day of the
  // month, amount = cash_received + bank_received from that day's shift
  // entries. Shift entries only — payouts and bookings are NOT in this series,
  // so its sum equals the booth-sales share of totalRevenue.
  dailyRevenue: DailyRevenue[];
  // Owner draws for the month (money pulled for personal use). NOT in
  // totalExpenses or netProfit — shown separately for the cash trail.
  ownerDraws: number;
}

export interface DailyRevenue {
  date: string;
  amount: number;
}

// GET /api/dashboard?month=2026-06
export async function GET(request: NextRequest) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");

  if (!month || !isMonth(month)) {
    return NextResponse.json({ error: "Invalid month (expected YYYY-MM)" }, { status: 400 });
  }

  const { startDate, endDate } = monthRange(month);
  const daysInMonth = Number(endDate.split("-")[2]);
  const todayStr = todayInKarachi();

  // All independent Supabase queries for this month run in one batch —
  // none of these depend on any other query's result. (attendance_overrides
  // used to be filtered by the employees query's user ids first; that
  // filter is dropped here since deriveAttendance already ignores any
  // override row that doesn't match a known employee id, so the two queries
  // can run in parallel instead of overrides waiting on employees.)
  const [
    { data: shifts, error: shiftErr },
    { data: expenseRows, error: expErr },
    { data: venues, error: venueErr },
    { data: bookingRows, error: bookingErr },
    { data: employees, error: empErr },
    { data: overrides, error: overErr },
    { data: depreciationRows, error: depErr },
    { data: recurringExpenses, error: recurErr },
    { data: payoutCycles, error: payoutErr },
    { data: owedRows, error: owedErr },
  ] = await Promise.all([
    // Shift entries for the month
    supabaseAdmin
      .from("shift_entries")
      .select("id, user_id, entry_date, venue_id, cash_received, bank_received, free_prints, waste_prints")
      .gte("entry_date", startDate)
      .lte("entry_date", endDate),

    // All money out for the month, in one query (Phase D — the unified
    // `expenses` table replaced the old entry_expenses + reimbursements pair).
    //
    // Accrual rule: an expense counts in the month of its expense_date,
    // regardless of when — or whether — an employee gets reimbursed for it.
    // Marking one paid never moves it between months.
    //
    // Owner draws come back in the same query (is_owner_draw) and are split
    // out below: they are never business costs.
    supabaseAdmin
      .from("expenses")
      .select("amount, category, venue_id, is_owner_draw")
      .gte("expense_date", startDate)
      .lte("expense_date", endDate),

    // Venue labels
    supabaseAdmin.from("venues").select("id, name"),

    // Booking (paid client event) revenue — CASH BASIS (Phase F). A payment
    // counts in the month its own date falls in; amount_charged and event_date
    // play no role. A cancelled booking's already-received advance still
    // counts — money doesn't get un-received by a status change.
    supabaseAdmin
      .from("bookings")
      .select("advance_amount, advance_date, final_amount, final_date")
      .or(
        `and(advance_date.gte.${startDate},advance_date.lte.${endDate}),` +
          `and(final_date.gte.${startDate},final_date.lte.${endDate})`
      ),

    // Attendance summary — same derivation logic as /api/attendance:
    // present = a shift_entries row exists for that user+date, unless an
    // attendance_overrides row exists for that date, which always wins.
    supabaseAdmin.from("users").select("id, name").eq("role", "employee").order("name"),

    supabaseAdmin
      .from("attendance_overrides")
      .select("user_id, override_date, is_present")
      .gte("override_date", startDate)
      .lte("override_date", endDate),

    // Straight-line depreciation for the month (Chunk 2) — the view's own
    // `month` column is the first day of the month, same format as
    // monthRange's startDate, so this is a direct equality match.
    supabaseAdmin.from("asset_depreciation").select("amount").eq("month", startDate),

    // Rent-coverage check (Chunk 4) — active recurring costs tied to a venue,
    // and the payout cycles that matter for this view: received this month
    // (payout revenue), not yet received, or due on/after the month start
    // ("next payout due" looks forward past the selected month too).
    supabaseAdmin
      .from("recurring_expenses")
      .select("name, amount, venue_id")
      .eq("active", true)
      .not("venue_id", "is", null),

    supabaseAdmin
      .from("payout_cycles")
      .select("venue_id, payout_due, gross_amount, rent_deducted, received_on")
      .or(
        `and(received_on.gte.${startDate},received_on.lte.${endDate}),` +
          `received_on.is.null,payout_due.gte.${startDate}`
      ),

    // Outstanding staff reimbursements, across ALL months.
    supabaseAdmin
      .from("expenses")
      .select("amount, payer_user_id, payer:users!expenses_payer_user_id_fkey(name)")
      .eq("paid_by", "employee")
      .eq("reimbursement_status", "pending"),
  ]);

  if (shiftErr) return dbError(shiftErr);
  if (expErr) return dbError(expErr);
  if (venueErr) return dbError(venueErr);
  if (bookingErr) return dbError(bookingErr);
  if (empErr) return dbError(empErr);
  if (overErr) return dbError(overErr);
  if (depErr) return dbError(depErr);
  if (recurErr) return dbError(recurErr);
  if (payoutErr) return dbError(payoutErr);
  if (owedErr) return dbError(owedErr);

  const shiftRows = shifts ?? [];
  const cycleRows = payoutCycles ?? [];

  // Venues with a payout cycle in view. Only these can raise the rent-coverage
  // alert (13b swaps this test for venues.collects_payments).
  const payoutVenueIds = new Set(cycleRows.map((c) => c.venue_id));

  // Rule: skip a 'Rent' expense row only when its venue had a payout RECEIVED
  // THIS MONTH with rent_deducted > 0 (that rent is counted via payoutRent).
  const rentFromPayoutVenueIds = new Set(
    cycleRows
      .filter(
        (c) => c.received_on && c.received_on >= startDate && c.received_on <= endDate && c.rent_deducted > 0
      )
      .map((c) => c.venue_id)
  );

  // Payout revenue — CASH BASIS: a cycle counts in the month its received_on
  // falls in. cycle_end and payout_due play no role; unreceived = nothing.
  let payoutRevenue = 0;
  let payoutRent = 0;
  let payoutCyclesPaid = 0;
  const payoutByVenue = new Map<string, { revenue: number; cycles: number }>();
  for (const c of cycleRows) {
    if (!c.received_on || c.received_on < startDate || c.received_on > endDate) continue;
    const gross = c.gross_amount ?? 0;
    payoutRevenue += gross;
    payoutRent += c.rent_deducted;
    payoutCyclesPaid += 1;
    const agg = payoutByVenue.get(c.venue_id) ?? { revenue: 0, cycles: 0 };
    agg.revenue += gross;
    agg.cycles += 1;
    payoutByVenue.set(c.venue_id, agg);
  }

  let totalExpenses = payoutRent;
  let ownerDraws = 0;
  const categoryAgg = new Map<string, number>();

  for (const e of expenseRows ?? []) {
    if (e.is_owner_draw) {
      ownerDraws += e.amount; // not a business cost: stays out of totals
      continue;
    }
    if (e.category === "Rent" && e.venue_id && rentFromPayoutVenueIds.has(e.venue_id)) continue;
    totalExpenses += e.amount;
    categoryAgg.set(e.category, (categoryAgg.get(e.category) ?? 0) + e.amount);
  }

  let owedToEmployees = 0;
  const owedAgg = new Map<string, OwedByEmployee>();
  for (const o of owedRows ?? []) {
    owedToEmployees += o.amount;
    if (!o.payer_user_id) continue;
    const row = owedAgg.get(o.payer_user_id) ?? {
      userId: o.payer_user_id,
      name: o.payer?.name ?? "Unknown",
      amount: 0,
    };
    row.amount += o.amount;
    owedAgg.set(o.payer_user_id, row);
  }
  const owedByEmployee = Array.from(owedAgg.values()).sort((a, b) => b.amount - a.amount);

  const expensesByCategory: CategoryExpense[] = Array.from(categoryAgg.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const venueNameMap = new Map((venues ?? []).map((v) => [v.id, v.name]));

  // Rent coverage: for each active venue-linked recurring expense, "covered"
  // means some payout_cycles row for that venue has a known payout_due
  // landing inside the selected month. nextPayoutDue is the earliest known
  // payout_due for that venue strictly after this month, for context.
  const rentCoverage: RentCoverageItem[] = [];
  for (const rec of recurringExpenses ?? []) {
    // Only payout venues can be "uncovered": a venue Lunaro collects at itself
    // and pays flat rent to (e.g. The Box Pine Avenue) has no payout to cover it.
    if (!rec.venue_id || !payoutVenueIds.has(rec.venue_id)) continue;
    const venueCycles = cycleRows
      .filter((c) => c.venue_id === rec.venue_id && c.payout_due !== null)
      .sort((a, b) => a.payout_due!.localeCompare(b.payout_due!));
    const covered = venueCycles.some(
      (c) => c.payout_due! >= startDate && c.payout_due! <= endDate
    );
    if (!covered) {
      const next = venueCycles.find((c) => c.payout_due! > endDate);
      rentCoverage.push({
        venueName: venueNameMap.get(rec.venue_id) ?? rec.venue_id,
        rentAmount: rec.amount,
        nextPayoutDue: next?.payout_due ?? null,
      });
    }
  }

  // Revenue + free/waste print totals, grouped by venue
  const venueAgg = new Map<string, { revenue: number; shiftCount: number; payoutCycles: number }>();
  let totalRevenue = 0;
  let freePrintsCount = 0;
  let wastePrints = 0;

  for (const s of shiftRows) {
    const entryRevenue = s.cash_received + s.bank_received;
    totalRevenue += entryRevenue;
    freePrintsCount += s.free_prints;
    wastePrints += s.waste_prints;

    const existing = venueAgg.get(s.venue_id) ?? { revenue: 0, shiftCount: 0, payoutCycles: 0 };
    existing.revenue += entryRevenue;
    existing.shiftCount += 1;
    venueAgg.set(s.venue_id, existing);
  }

  // Payout-only venues (no shift entries) still appear with their real revenue.
  for (const [venueId, p] of payoutByVenue) {
    const existing = venueAgg.get(venueId) ?? { revenue: 0, shiftCount: 0, payoutCycles: 0 };
    existing.revenue += p.revenue;
    existing.payoutCycles += p.cycles;
    venueAgg.set(venueId, existing);
  }
  totalRevenue += payoutRevenue;

  const dailyAgg = new Map<string, number>();
  for (const s of shiftRows) {
    dailyAgg.set(s.entry_date, (dailyAgg.get(s.entry_date) ?? 0) + s.cash_received + s.bank_received);
  }
  const dailyRevenue: DailyRevenue[] = Array.from({ length: daysInMonth }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { date, amount: dailyAgg.get(date) ?? 0 };
  });

  const revenueByVenue: VenueRevenue[] = Array.from(venueAgg.entries())
    .map(([venueId, agg]) => ({
      venueId,
      venueName: venueNameMap.get(venueId) ?? venueId,
      revenue: agg.revenue,
      shiftCount: agg.shiftCount,
      payoutCycles: agg.payoutCycles,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  let bookingRevenue = 0;
  let bookingPaymentsCount = 0;
  for (const b of bookingRows ?? []) {
    if (b.advance_date && b.advance_date >= startDate && b.advance_date <= endDate && b.advance_amount) {
      bookingRevenue += b.advance_amount;
      bookingPaymentsCount += 1;
    }
    if (b.final_date && b.final_date >= startDate && b.final_date <= endDate && b.final_amount) {
      bookingRevenue += b.final_amount;
      bookingPaymentsCount += 1;
    }
  }

  totalRevenue += bookingRevenue;

  const employeeRows = employees ?? [];

  const derivedAttendance = deriveAttendance(
    employeeRows,
    shiftRows.map((s) => ({ user_id: s.user_id, entry_date: s.entry_date })),
    overrides ?? [],
    month,
    todayStr
  );

  const attendance: AttendanceSummaryRow[] = derivedAttendance.map((emp) => ({
    id: emp.id,
    name: emp.name,
    daysPresent: emp.days.filter((d) => d.status === "present").length,
    days: emp.days.map((d) => ({ date: d.date, status: d.status })),
  }));

  const depreciation = (depreciationRows ?? []).reduce((s, r) => s + r.amount, 0);

  // Every row in `expenses` is money out, whoever fronted it — so net profit
  // is revenue minus the whole table for the month, minus this month's
  // depreciation (a non-cash cost — see asset_depreciation). Owner draws are
  // excluded from totalExpenses, so they never reach netProfit.
  const netProfit = totalRevenue - totalExpenses - depreciation;

  const response: DashboardResponse = {
    totalRevenue,
    totalExpenses,
    owedToEmployees,
    owedByEmployee,
    netProfit,
    freePrintsCount,
    wastePrints,
    bookingRevenue,
    bookingPaymentsCount,
    payoutRevenue,
    payoutRent,
    payoutCyclesPaid,
    depreciation,
    revenueByVenue,
    expensesByCategory,
    attendance,
    daysInMonth,
    rentCoverage,
    dailyRevenue,
    ownerDraws,
  };

  return NextResponse.json(response);
}
