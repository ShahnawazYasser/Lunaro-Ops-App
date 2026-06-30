import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

export interface AttendanceDay {
  status: "present" | "absent" | "future";
  hasOverride: boolean;
}

export interface EmployeeAttendance {
  userId: string;
  name: string;
  attendance: Record<string, AttendanceDay>;
}

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

  const [yearStr, monStr] = month.split("-");
  const year = Number(yearStr);
  const mon = Number(monStr);

  // Days in the month
  const daysInMonth = new Date(year, mon, 0).getDate();
  const startDate = `${yearStr}-${monStr}-01`;
  const endDate = `${yearStr}-${monStr}-${String(daysInMonth).padStart(2, "0")}`;

  // Today in local-ish time (server is UTC; we'll compare as date strings)
  const todayStr = new Date().toISOString().split("T")[0];

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

  // Index by userId → date for O(1) lookup
  const shiftSet = new Set<string>(
    (shifts ?? []).map((s) => `${s.user_id}|${s.entry_date}`)
  );
  const overrideMap = new Map<string, boolean>();
  for (const o of overrides ?? []) {
    overrideMap.set(`${o.user_id}|${o.override_date}`, o.is_present);
  }

  // Build attendance grid
  const result: EmployeeAttendance[] = employees.map((emp) => {
    const attendance: Record<string, AttendanceDay> = {};

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearStr}-${monStr}-${String(day).padStart(2, "0")}`;

      if (dateStr > todayStr) {
        attendance[dateStr] = { status: "future", hasOverride: false };
        continue;
      }

      const key = `${emp.id}|${dateStr}`;
      const hasOverride = overrideMap.has(key);

      if (hasOverride) {
        attendance[dateStr] = {
          status: overrideMap.get(key) ? "present" : "absent",
          hasOverride: true,
        };
      } else {
        attendance[dateStr] = {
          status: shiftSet.has(key) ? "present" : "absent",
          hasOverride: false,
        };
      }
    }

    return { userId: emp.id, name: emp.name, attendance };
  });

  return NextResponse.json({ employees: result, daysInMonth });
}
