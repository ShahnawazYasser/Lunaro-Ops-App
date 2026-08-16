import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { monthRange, todayInKarachi } from "@/lib/dates";
import { deriveAttendance } from "@/lib/attendance";

const FREE_PRINT_COST = 500;

export interface VenueRevenue {
  venueId: string;
  venueName: string;
  revenue: number;
  shiftCount: number;
}

export interface AttendanceSummaryRow {
  id: string;
  name: string;
  daysPresent: number;
}

export interface CategoryExpense {
  category: string;
  amount: number;
}

export interface DashboardResponse {
  totalRevenue: number;
  // Kept for the current dashboard UI: the shift-linked slice of expenses.
  operationalExpenses: number;
  // Kept for the current dashboard UI: employee-paid expenses, all statuses.
  reimbursements: number;
  // Phase D additions — the honest split, now the basis of the Phase E UI.
  totalExpenses: number;
  owedToEmployees: number;
  netProfit: number;
  freePrintsCount: number;
  freePrintsCost: number;
  wastePrints: number;
  // Cash-basis booking revenue for the month (Phase F) — sum of advance/final
  // payments whose *payment date* falls in this month. amount_charged and
  // event_date play no role here. bookingPaymentsCount is just the number of
  // qualifying payments, for the "Client events" line's subtitle.
  bookingRevenue: number;
  bookingPaymentsCount: number;
  revenueByVenue: VenueRevenue[];
  expensesByCategory: CategoryExpense[];
  attendance: AttendanceSummaryRow[];
  daysInMonth: number;
}

// GET /api/dashboard?month=2026-06
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month (expected YYYY-MM)" }, { status: 400 });
  }

  const { startDate, endDate } = monthRange(month);
  const daysInMonth = Number(endDate.split("-")[2]);
  const todayStr = todayInKarachi();

  // Shift entries for the month
  const { data: shifts, error: shiftErr } = await supabaseAdmin
    .from("shift_entries")
    .select("id, user_id, entry_date, venue_id, cash_received, bank_received, free_prints, waste_prints")
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  if (shiftErr) return NextResponse.json({ error: shiftErr.message }, { status: 500 });

  const shiftRows = shifts ?? [];

  // All money out for the month, in one query (Phase D — the unified
  // `expenses` table replaced the old entry_expenses + reimbursements pair).
  //
  // Accrual rule: an expense counts in the month of its expense_date,
  // regardless of when — or whether — an employee gets reimbursed for it.
  // Marking one paid never moves it between months.
  const { data: expenseRows, error: expErr } = await supabaseAdmin
    .from("expenses")
    .select("amount, category, paid_by, reimbursement_status, shift_entry_id")
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);

  if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 });

  let totalExpenses = 0;
  let operationalExpenses = 0;
  let reimbursements = 0;
  let owedToEmployees = 0;
  const categoryAgg = new Map<string, number>();

  for (const e of expenseRows ?? []) {
    totalExpenses += e.amount;
    if (e.shift_entry_id) operationalExpenses += e.amount;
    if (e.paid_by === "employee") {
      reimbursements += e.amount;
      if (e.reimbursement_status === "pending") owedToEmployees += e.amount;
    }
    categoryAgg.set(e.category, (categoryAgg.get(e.category) ?? 0) + e.amount);
  }

  const expensesByCategory: CategoryExpense[] = Array.from(categoryAgg.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Venue labels
  const { data: venues, error: venueErr } = await supabaseAdmin.from("venues").select("id, name");
  if (venueErr) return NextResponse.json({ error: venueErr.message }, { status: 500 });
  const venueNameMap = new Map((venues ?? []).map((v) => [v.id, v.name]));

  // Revenue + free/waste print totals, grouped by venue
  const venueAgg = new Map<string, { revenue: number; shiftCount: number }>();
  let totalRevenue = 0;
  let freePrintsCount = 0;
  let wastePrints = 0;

  for (const s of shiftRows) {
    const entryRevenue = s.cash_received + s.bank_received;
    totalRevenue += entryRevenue;
    freePrintsCount += s.free_prints;
    wastePrints += s.waste_prints;

    const existing = venueAgg.get(s.venue_id) ?? { revenue: 0, shiftCount: 0 };
    existing.revenue += entryRevenue;
    existing.shiftCount += 1;
    venueAgg.set(s.venue_id, existing);
  }

  const revenueByVenue: VenueRevenue[] = Array.from(venueAgg.entries())
    .map(([venueId, agg]) => ({
      venueId,
      venueName: venueNameMap.get(venueId) ?? venueId,
      revenue: agg.revenue,
      shiftCount: agg.shiftCount,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Booking (paid client event) revenue — CASH BASIS (Phase F). A payment
  // counts in the month its own date falls in; amount_charged and event_date
  // play no role. A cancelled booking's already-received advance still
  // counts — money doesn't get un-received by a status change.
  const { data: bookingRows, error: bookingErr } = await supabaseAdmin
    .from("bookings")
    .select("advance_amount, advance_date, final_amount, final_date")
    .or(
      `and(advance_date.gte.${startDate},advance_date.lte.${endDate}),` +
        `and(final_date.gte.${startDate},final_date.lte.${endDate})`
    );

  if (bookingErr) return NextResponse.json({ error: bookingErr.message }, { status: 500 });

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

  // Attendance summary — same derivation logic as /api/attendance:
  // present = a shift_entries row exists for that user+date, unless an
  // attendance_overrides row exists for that date, which always wins.
  const { data: employees, error: empErr } = await supabaseAdmin
    .from("users")
    .select("id, name")
    .eq("role", "employee")
    .order("name");

  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 });
  const employeeRows = employees ?? [];
  const employeeIds = employeeRows.map((e) => e.id);

  const { data: overrides, error: overErr } = await supabaseAdmin
    .from("attendance_overrides")
    .select("user_id, override_date, is_present")
    .in("user_id", employeeIds.length > 0 ? employeeIds : [""])
    .gte("override_date", startDate)
    .lte("override_date", endDate);

  if (overErr) return NextResponse.json({ error: overErr.message }, { status: 500 });

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
  }));

  // Every row in `expenses` is money out, whoever fronted it — so net profit
  // is simply revenue minus the whole table for the month. (operationalExpenses
  // and reimbursements are overlapping slices of totalExpenses, not addends;
  // never sum them.)
  const netProfit = totalRevenue - totalExpenses;

  const response: DashboardResponse = {
    totalRevenue,
    operationalExpenses,
    reimbursements,
    totalExpenses,
    owedToEmployees,
    netProfit,
    freePrintsCount,
    freePrintsCost: freePrintsCount * FREE_PRINT_COST,
    wastePrints,
    bookingRevenue,
    bookingPaymentsCount,
    revenueByVenue,
    expensesByCategory,
    attendance,
    daysInMonth,
  };

  return NextResponse.json(response);
}
