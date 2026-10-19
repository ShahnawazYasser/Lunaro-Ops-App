// Canonical expense categories.
//
// Deliberately app-enforced, not a DB check constraint: adding a category
// is a one-line change here plus a deploy, with no migration. Every API
// route that accepts a category validates against these lists.

export const CATEGORIES = [
  "Operational",
  "Salary",
  "Paper",
  "Ink",
  "Maintenance",
  "Petrol",
  "Food",
  "Rent",
  "Transport",
  "Venue/Event",
  "Misc",
] as const;

export type Category = (typeof CATEGORIES)[number];

// The subset an employee is allowed to log for themselves. The owner can
// use any category in CATEGORIES.
export const EMPLOYEE_CATEGORIES = [
  "Petrol",
  "Food",
  "Transport",
  "Misc",
] as const;

export type EmployeeCategory = (typeof EMPLOYEE_CATEGORIES)[number];

// What can be picked on a shift entry's expense rows (employee form and the
// owner's entry edit). Shift costs are day-of, company-paid money out, so
// Salary and Rent — which are never incurred on a shift — are left out.
export const SHIFT_EXPENSE_CATEGORIES = [
  "Operational",
  "Paper",
  "Ink",
  "Maintenance",
  "Petrol",
  "Food",
  "Transport",
  "Venue/Event",
  "Misc",
] as const;

export type ShiftExpenseCategory = (typeof SHIFT_EXPENSE_CATEGORIES)[number];

// Missing/blank falls back to "Operational" (what every shift expense was
// before the picker existed). Returns null for anything else not allowed.
export function resolveShiftCategory(value: unknown): ShiftExpenseCategory | null {
  if (value === undefined || value === null || value === "") return "Operational";
  return typeof value === "string" &&
    (SHIFT_EXPENSE_CATEGORIES as readonly string[]).includes(value)
    ? (value as ShiftExpenseCategory)
    : null;
}

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

export function isEmployeeCategory(value: unknown): value is EmployeeCategory {
  return (
    typeof value === "string" && (EMPLOYEE_CATEGORIES as readonly string[]).includes(value)
  );
}
