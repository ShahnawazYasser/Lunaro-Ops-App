import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { monthRange } from "@/lib/dates";
import { isCategory, isEmployeeCategory } from "@/lib/categories";
import type { PaidBy, ReimbursementStatus } from "@/lib/supabase/types";

// The unified money-out API (Phase D). Replaces /api/reimbursements.
//
//   paid_by = 'company'  → a normal business expense
//   paid_by = 'employee' → the employee fronted it and is owed it back until
//                          reimbursement_status = 'paid'
// Either way the row is always an expense in P&L, in the month of
// expense_date — marking it paid never moves it between months.

// PostgREST embed note: expenses has THREE foreign keys to users
// (payer_user_id, related_user_id, logged_by), so every users embed here
// must pin its constraint name or PostgREST returns PGRST201.
const SELECT = `
  id, expense_date, category, amount, description, receipt_url,
  paid_by, payer_user_id, reimbursement_status,
  related_user_id, shift_entry_id, venue_id, logged_by, created_at,
  payer:users!expenses_payer_user_id_fkey(name),
  related:users!expenses_related_user_id_fkey(name),
  venues(name)
`;

// ── GET /api/expenses?month=2026-08&paidBy=all|company|employee&userId=… ──
//
// Any authenticated user. Employees only ever receive their own
// employee-paid rows, whatever the query params say — enforced here, not in
// the client.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const paidBy = searchParams.get("paidBy");
  const userId = searchParams.get("userId");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format (expected YYYY-MM)" }, { status: 400 });
  }
  if (paidBy !== null && paidBy !== "all" && paidBy !== "company" && paidBy !== "employee") {
    return NextResponse.json({ error: "Invalid paidBy filter" }, { status: 400 });
  }

  const { startDate, endDate } = monthRange(month);

  let query = supabaseAdmin
    .from("expenses")
    .select(SELECT)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (session.role === "owner") {
    if (paidBy && paidBy !== "all") query = query.eq("paid_by", paidBy);
    if (userId && userId !== "all") query = query.eq("payer_user_id", userId);
  } else {
    // Employees: own employee-paid rows only, no exceptions.
    query = query.eq("paid_by", "employee").eq("payer_user_id", session.userId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ expenses: data ?? [] });
}

// ── POST /api/expenses ────────────────────────────────────────────────────
interface ExpenseBody {
  category: string;
  amount: number;
  expenseDate: string;
  description?: string | null;
  venueId?: string | null;
  receiptUrl?: string | null;
  // Owner-only fields — ignored entirely when an employee is the caller.
  paidBy?: PaidBy;
  payerUserId?: string | null;
  relatedUserId?: string | null;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: ExpenseBody;
  try {
    body = (await request.json()) as ExpenseBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { category, amount, expenseDate, description, venueId, receiptUrl } = body;

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }
  if (!expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
    return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  }

  const isOwner = session.role === "owner";

  let paidBy: PaidBy;
  let payerUserId: string | null;
  let reimbursementStatus: ReimbursementStatus | null;
  let relatedUserId: string | null = null;

  if (!isOwner) {
    // Employees can only ever log money they paid out of their own pocket.
    if (!isEmployeeCategory(category)) {
      return NextResponse.json(
        { error: "That category isn't one you can log. Use Petrol, Food, Transport, or Misc." },
        { status: 400 }
      );
    }
    paidBy = "employee";
    payerUserId = session.userId;
    reimbursementStatus = "pending";
  } else {
    if (!isCategory(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }

    paidBy = body.paidBy ?? "company";
    if (paidBy !== "company" && paidBy !== "employee") {
      return NextResponse.json({ error: "Paid by must be 'company' or 'employee'" }, { status: 400 });
    }

    // These mirror the expenses_payer_consistency DB constraint, checked here
    // so the caller gets a plain message instead of a Postgres error.
    if (paidBy === "employee") {
      if (!body.payerUserId) {
        return NextResponse.json(
          { error: "Pick who paid for this — an employee-paid expense needs a payer." },
          { status: 400 }
        );
      }
      payerUserId = body.payerUserId;
      reimbursementStatus = "pending";
    } else {
      payerUserId = null;
      reimbursementStatus = null;
    }

    relatedUserId = body.relatedUserId ?? null;
  }

  const { data, error } = await supabaseAdmin
    .from("expenses")
    .insert({
      expense_date: expenseDate,
      category,
      amount,
      description: description?.trim() || null,
      receipt_url: receiptUrl ?? null,
      paid_by: paidBy,
      payer_user_id: payerUserId,
      reimbursement_status: reimbursementStatus,
      related_user_id: relatedUserId,
      venue_id: venueId || null,
      logged_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
