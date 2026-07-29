import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { monthRange, todayInKarachi } from "@/lib/dates";
import { deriveAttendance, type AttendanceDay, type EmployeeAttendance } from "@/lib/attendance";

export type { AttendanceDay, EmployeeAttendance };

// GET /api/attendance?month=2026-06
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

  // Fetch employees only (not owner)
  const { data: employees, error: empErr } = await supabaseAdmin
    .from("users")
    .select("id, name")
    .eq("role", "employee")
    .order("name");

  if (empErr || !employees) {
    return NextResponse.json({ error: empErr?.message ?? "Failed to fetch employees" }, { status: 500 });
  }

  const employeeIds = employees.map((e) => e.id);

  // Fetch shift_entries for the month
  const { data: shifts, error: shiftErr } = await supabaseAdmin
    .from("shift_entries")
    .select("user_id, entry_date")
    .in("user_id", employeeIds)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate);

  if (shiftErr) return NextResponse.json({ error: shiftErr.message }, { status: 500 });

  // Fetch attendance_overrides for the month
  const { data: overrides, error: overErr } = await supabaseAdmin
    .from("attendance_overrides")
    .select("user_id, override_date, is_present")
    .in("user_id", employeeIds)
    .gte("override_date", startDate)
    .lte("override_date", endDate);

  if (overErr) return NextResponse.json({ error: overErr.message }, { status: 500 });

  const result = deriveAttendance(employees, shifts ?? [], overrides ?? [], month, todayStr);

  return NextResponse.json({ employees: result, daysInMonth });
}
