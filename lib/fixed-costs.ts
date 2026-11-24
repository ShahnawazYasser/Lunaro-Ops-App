// Shared rule for which fixed costs (recurring_expenses) apply to a month.
// Used by the dashboard's "not yet counted" notice and by the posting route,
// so the two can never disagree.

export interface FixedCostWindow {
  active: boolean;
  starts_on: string | null;
  ends_on: string | null;
}

/** Active, and the month overlaps the optional [starts_on, ends_on] window. */
export function appliesInMonth(
  rec: FixedCostWindow,
  startDate: string,
  endDate: string
): boolean {
  if (!rec.active) return false;
  if (rec.starts_on && rec.starts_on > endDate) return false;
  if (rec.ends_on && rec.ends_on < startDate) return false;
  return true;
}
