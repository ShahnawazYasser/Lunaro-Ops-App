import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

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

export interface DashboardResponse {
  totalRevenue: number;
  operationalExpenses: number;
  reimbursements: number;
  netProfit: number;
  freePrintsCount: number;
  freePrintsCost: number;
  wastePrints: number;
  revenueByVenue: VenueRevenue[];
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

  const [yearStr, monStr] = month.split("-");
  const year = Number(yearStr);
  const mon = Number(monStr);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const startDate = `${yearStr}-${monStr}-01`;
  const endDate = `${yearStr}-${monStr}-${String(daysInMonth).padStart(2, "0")}`;
  const todayStr = new Date().toISOString().split("T")[0];

  // Shift entries for the month
  const { data: shifts, error: shiftErr } = await supabaseAdmin
    .from("shift_entries")
    .select("id, user_id, entry_date, venue_id, cash_received, bank_received, free_prints, waste_prints")
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  if (shiftErr) return NextResponse.json({ error: shiftErr.message }, { status: 500 });

  const shiftRows = shifts ?? [];
  const shiftIds = shiftRows.map((s) => s.id);

  // Operational expenses tied to this month's shifts
  let operationalExpenses = 0;
  if (shiftIds.length > 0) {
    const { data: expenses, error: expErr } = await supabaseAdmin
      .from("entry_expenses")
      .select("amount")
      .in("shift_entry_id", shiftIds);

    if (expErr) return NextResponse.json({ error: expErr.message }, { status: 500 });
    operationalExpenses = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);
  }

  // Reimbursements logged this month
  const { data: reimbRows, error: reimbErr } = await supabaseAdmin
    .from("reimbursements")
    .select("amount")
    .gte("expense_date", startDate)
    .lte("expense_date", endDate);

  if (reimbErr) return NextResponse.json({ error: reimbErr.message }, { status: 500 });
  const reimbursements = (reimbRows ?? []).reduce((sum, r) => sum + r.amount, 0);

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

  const shiftSet = new Set<string>(shiftRows.map((s) => `${s.user_id}|${s.entry_date}`));
  const overrideMap = new Map<string, boolean>();
  for (const o of overrides ?? []) {
    overrideMap.set(`${o.user_id}|${o.override_date}`, o.is_present);
  }

  const attendance: AttendanceSummaryRow[] = employeeRows.map((emp) => {
    let daysPresent = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearStr}-${monStr}-${String(day).padStart(2, "0")}`;
      if (dateStr > todayStr) continue; // future days don't count either way

      const key = `${emp.id}|${dateStr}`;
      const isPresent = overrideMap.has(key) ? overrideMap.get(key)! : shiftSet.has(key);
      if (isPresent) daysPresent++;
    }
    return { id: emp.id, name: emp.name, daysPresent };
  });

  const netProfit = totalRevenue - operationalExpenses - reimbursements;

  const response: DashboardResponse = {
    totalRevenue,
    operationalExpenses,
    reimbursements,
    netProfit,
    freePrintsCount,
    freePrintsCost: freePrintsCount * FREE_PRINT_COST,
    wastePrints,
    revenueByVenue,
    attendance,
    daysInMonth,
  };

  return NextResponse.json(response);
}
