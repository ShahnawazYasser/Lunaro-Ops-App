import { supabaseAdmin } from "@/lib/supabase/server";
import { monthRange, todayInKarachi } from "@/lib/dates";
import { deriveAttendance, type EmployeeAttendance } from "@/lib/attendance";
import { check } from "./errors";

export interface AttendanceData {
  employees: EmployeeAttendance[];
  daysInMonth: number;
}

// Per-employee present/absent/future for a "YYYY-MM" month. Caller has already
// checked the session is the owner and the month is valid.
export async function getAttendance(month: string): Promise<AttendanceData> {
  const { startDate, endDate } = monthRange(month);
  const daysInMonth = Number(endDate.split("-")[2]);
  const todayStr = todayInKarachi();

  // Employees only (not owner)
  const { data: employees, error: empErr } = await supabaseAdmin
    .from("users")
    .select("id, name, active")
    .eq("role", "employee")
    .order("name");
  check(empErr);
  const staff = employees ?? [];
  const employeeIds = staff.map((e) => e.id);

  const [shiftRes, overRes] = await Promise.all([
    supabaseAdmin
      .from("shift_entries")
      .select("user_id, entry_date")
      .in("user_id", employeeIds)
      .gte("entry_date", startDate)
      .lte("entry_date", endDate),
    supabaseAdmin
      .from("attendance_overrides")
      .select("user_id, override_date, is_present")
      .in("user_id", employeeIds)
      .gte("override_date", startDate)
      .lte("override_date", endDate),
  ]);
  check(shiftRes.error);
  check(overRes.error);
  const shifts = shiftRes.data ?? [];

  // A deactivated employee only appears in months where they have at least one entry.
  const hadEntry = new Set(shifts.map((s) => s.user_id));
  const shown = staff
    .filter((e) => e.active || hadEntry.has(e.id))
    .map((e) => ({ id: e.id, name: e.name }));

  return {
    employees: deriveAttendance(shown, shifts, overRes.data ?? [], month, todayStr),
    daysInMonth,
  };
}
