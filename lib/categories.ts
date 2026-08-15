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

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

export function isEmployeeCategory(value: unknown): value is EmployeeCategory {
  return (
    typeof value === "string" && (EMPLOYEE_CATEGORIES as readonly string[]).includes(value)
  );
}
