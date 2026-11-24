import { supabaseAdmin } from "@/lib/supabase/server";
import { monthRange } from "@/lib/dates";
import type { SessionUser } from "@/lib/session";
import { check } from "./errors";

// PostgREST embed note: expenses has THREE foreign keys to users
// (payer_user_id, related_user_id, logged_by), so every users embed here
// must pin its constraint name or PostgREST returns PGRST201.
const SELECT = `
  id, expense_date, category, amount, description, receipt_url,
  paid_by, payer_user_id, reimbursement_status,
  related_user_id, shift_entry_id, venue_id, logged_by, created_at,
  payer:users!expenses_payer_user_id_fkey(name),
  related:users!expenses_related_user_id_fkey(name),
  logger:users!expenses_logged_by_fkey(name),
  venues(name)
`;

export interface ExpenseFilters {
  paidBy?: "all" | "company" | "employee";
  /** a user id, or "all" */
  userId?: string;
}

// Employees only ever receive their own employee-paid rows, whatever the
// filters say — enforced here, not in the client.
export async function getExpenses(session: Pick<SessionUser, "role" | "userId">, month: string, filters: ExpenseFilters = {}) {
  const { startDate, endDate } = monthRange(month);

  let query = supabaseAdmin
    .from("expenses")
    .select(SELECT)
    .eq("is_owner_draw", false) // draws live on /api/draws, never in the expense list
    .gte("expense_date", startDate)
    .lte("expense_date", endDate)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (session.role === "owner") {
    if (filters.paidBy && filters.paidBy !== "all") query = query.eq("paid_by", filters.paidBy);
    if (filters.userId && filters.userId !== "all") query = query.eq("payer_user_id", filters.userId);
  } else {
    // Employees: own employee-paid rows only, no exceptions.
    query = query.eq("paid_by", "employee").eq("payer_user_id", session.userId);
  }

  const { data, error } = await query;
  check(error);
  return { expenses: data ?? [] };
}
