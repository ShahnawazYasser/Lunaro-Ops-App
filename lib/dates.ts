// Central date helpers. Never round-trip through Date/toISOString for
// month-boundary or "today" logic — that silently shifts by a day in any
// timezone ahead of UTC (we run in Asia/Karachi, UTC+5).

export interface MonthRange {
  startDate: string;
  endDate: string;
}

// "YYYY-MM" -> first/last calendar day of that month, as "YYYY-MM-DD" strings.
export function monthRange(month: string): MonthRange {
  const [yearStr, monStr] = month.split("-");
  const year = Number(yearStr);
  const mon = Number(monStr);
  const daysInMonth = new Date(year, mon, 0).getDate();

  return {
    startDate: `${yearStr}-${monStr}-01`,
    endDate: `${yearStr}-${monStr}-${String(daysInMonth).padStart(2, "0")}`,
  };
}

// Today's date in Asia/Karachi, as "YYYY-MM-DD".
export function todayInKarachi(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

// "YYYY-MM-DD" shifted by `days` (negative = earlier). Pure calendar math in
// UTC — no local-timezone or toISOString round-trip.
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = String(dt.getUTCFullYear()).padStart(4, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
