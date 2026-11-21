import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError, fail } from "@/lib/api";
import { isMonth } from "@/lib/validate";
import { supabaseAdmin } from "@/lib/supabase/server";
import { monthRange, todayInKarachi } from "@/lib/dates";
import { deriveAttendance, type AttendanceDay, type EmployeeAttendance } from "@/lib/attendance";

export const preferredRegion = "sin1";

export type { AttendanceDay, EmployeeAttendance };

// GET /api/attendance?month=2026-06
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

  // Fetch employees only (not owner)
  const { data: employees, error: empErr } = await supabaseAdmin
    .from("users")
    .select("id, name")
    .eq("role", "employee")
    .order("name");

  if (empErr || !employees) {
    return empErr ? dbError(empErr) : fail(500, "Something went wrong. Try again.", "write returned no row");
  }

  const employeeIds = employees.map((e) => e.id);

  // Fetch shift_entries for the month
  const { data: shifts, error: shiftErr } = await supabaseAdmin
    .from("shift_entries")
    .select("user_id, entry_date")
    .in("user_id", employeeIds)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  if (shiftErr) return dbError(shiftErr);

  // Fetch attendance_overrides for the month
  const { data: overrides, error: overErr } = await supabaseAdmin
    .from("attendance_overrides")
    .select("user_id, override_date, is_present")
    .in("user_id", employeeIds)
    .gte("override_date", startDate)
    .lte("override_date", endDate);

  if (overErr) return dbError(overErr);

  const result = deriveAttendance(employees, shifts ?? [], overrides ?? [], month, todayStr);

  return NextResponse.json({ employees: result, daysInMonth });
}
