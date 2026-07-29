import { monthRange } from "@/lib/dates";

export interface AttendanceDay {
  date: string;
  status: "present" | "absent" | "future";
  isOverridden: boolean;
}

export interface EmployeeAttendance {
  id: string;
  name: string;
  days: AttendanceDay[];
}

export interface AttendanceEmployee {
  id: string;
  name: string;
}

export interface AttendanceShift {
  user_id: string;
  entry_date: string;
}

export interface AttendanceOverride {
  user_id: string;
  override_date: string;
  is_present: boolean;
}

// Present = a shift_entries row exists for that user+date, unless an
// attendance_overrides row exists for that date, which always wins.
// Days after todayStr are marked "future" and excluded from either count.
export function deriveAttendance(
  employees: AttendanceEmployee[],
  shifts: AttendanceShift[],
  overrides: AttendanceOverride[],
  month: string,
  todayStr: string
): EmployeeAttendance[] {
  const [yearStr, monStr] = month.split("-");
  const { endDate } = monthRange(month);
  const daysInMonth = Number(endDate.split("-")[2]);

  const shiftSet = new Set<string>(shifts.map((s) => `${s.user_id}|${s.entry_date}`));
  const overrideMap = new Map<string, boolean>();
  for (const o of overrides) {
    overrideMap.set(`${o.user_id}|${o.override_date}`, o.is_present);
  }

  return employees.map((emp) => {
    const days: AttendanceDay[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${yearStr}-${monStr}-${String(day).padStart(2, "0")}`;

      if (dateStr > todayStr) {
        days.push({ date: dateStr, status: "future", isOverridden: false });
        continue;
      }

      const key = `${emp.id}|${dateStr}`;
      const hasOverride = overrideMap.has(key);

      if (hasOverride) {
        days.push({
          date: dateStr,
          status: overrideMap.get(key) ? "present" : "absent",
          isOverridden: true,
        });
      } else {
        days.push({
          date: dateStr,
          status: shiftSet.has(key) ? "present" : "absent",
          isOverridden: false,
        });
      }
    }

    return { id: emp.id, name: emp.name, days };
  });
}
