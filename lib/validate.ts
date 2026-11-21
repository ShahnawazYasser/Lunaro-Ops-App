// Small pure input validators for API routes. No dependencies.
// Each returns the cleaned value, or null when the input isn't acceptable —
// callers turn null into a 400 that names the field.

// A real calendar date in YYYY-MM-DD form (rejects 2026-02-30, not just bad shapes).
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// HH:MM or HH:MM:SS, 24-hour.
export function isTime(s: unknown): s is string {
  return typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s);
}

// A whole number within [min, max].
export function int(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  return v >= min && v <= max ? v : null;
}

// A finite amount with at most 2 decimals within [min, max].
export function money(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (Math.abs(Math.round(v * 100) - v * 100) > 1e-6) return null;
  return v >= min && v <= max ? v : null;
}

// A trimmed string of at most maxLen characters (empty string is allowed).
export function str(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length <= maxLen ? t : null;
}

// A UUID (any version) in canonical text form.
export function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

// "YYYY-MM" that names a real month.
export function isMonth(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}
