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

// ── One clock (Chunk 13c) ──────────────────────────────────────────────────
// The business runs on Asia/Karachi, whatever the device clock says. Client
// and server code both use these; none of them read the device timezone.

// This month in Asia/Karachi, as "YYYY-MM".
export function currentMonthInKarachi(): string {
  return todayInKarachi().slice(0, 7);
}

// "YYYY-MM" shifted by `delta` months. Pure integer maths — no Date, no timezone.
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(mon).padStart(2, "0")}`;
}

// "2026-11" -> "November 2026". Built from local parts, so no timezone shift.
export function formatMonthLabel(month: string): string {
  const [y, mo] = month.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-PK", {
    month: "long",
    year: "numeric",
  });
}

// "2026-11-05" -> "5 Nov 2026" (or "5 Nov" with { year: false }).
export function formatDate(dateStr: string, opts: { year?: boolean } = {}): string {
  const withYear = opts.year ?? true;
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

// Longest shift we accept. Anything beyond this is almost certainly a typo.
export const MAX_SHIFT_MINUTES = 16 * 60;

// "HH:MM" or "HH:MM:SS" in/out -> "5 hrs", "2 hrs 30 min", "45 min".
// A clock-out earlier than the clock-in means the shift ended the next day
// (+24h). Returns "" when either time is missing, the times are equal, or the
// shift would be over 16 hours — callers show "Check the times" for that case.
export function hoursWorked(clockIn: string | null | undefined, clockOut: string | null | undefined): string {
  if (!clockIn || !clockOut) return "";
  const [inH, inM] = clockIn.split(":").map(Number);
  const [outH, outM] = clockOut.split(":").map(Number);
  if ([inH, inM, outH, outM].some((n) => Number.isNaN(n))) return "";
  let diff = outH * 60 + outM - (inH * 60 + inM);
  if (diff < 0) diff += 24 * 60;
  if (diff <= 0 || diff > MAX_SHIFT_MINUTES) return "";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hrs`;
  return `${h} hrs ${m} min`;
}
