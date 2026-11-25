import { NextRequest, NextResponse } from "next/server";
import { requireSession, dbError, dataError, fail } from "@/lib/api";
import { getExpenses, type ExpenseFilters } from "@/lib/data/expenses";
import { isIsoDate, isMonth, isUuid, money, str } from "@/lib/validate";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isCategory, isEmployeeCategory } from "@/lib/categories";
import type { PaidBy, ReimbursementStatus } from "@/lib/supabase/types";

export const preferredRegion = "sin1";

// The unified money-out API (Phase D). Replaces /api/reimbursements.
//
//   paid_by = 'company'  → a normal business expense
//   paid_by = 'employee' → the employee fronted it and is owed it back until
//                          reimbursement_status = 'paid'
// Either way the row is always an expense in P&L, in the month of
// expense_date — marking it paid never moves it between months.

// ── GET /api/expenses?month=2026-08&paidBy=all|company|employee&userId=… ──
//
// Any authenticated user. Employees only ever receive their own
// employee-paid rows, whatever the query params say — enforced here, not in
// the client.
export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const paidBy = searchParams.get("paidBy");
  const userId = searchParams.get("userId");
  if (userId !== null && userId !== "all" && !isUuid(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  if (!month || !isMonth(month)) {
    return NextResponse.json({ error: "Invalid month format (expected YYYY-MM)" }, { status: 400 });
  }
  if (paidBy !== null && paidBy !== "all" && paidBy !== "company" && paidBy !== "employee") {
    return NextResponse.json({ error: "Invalid paidBy filter" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await getExpenses(session, month, {
        paidBy: (paidBy ?? undefined) as ExpenseFilters["paidBy"],
        userId: userId ?? undefined,
      }),
    );
  } catch (e) {
    return dataError(e);
  }
}

// Storage path written by /api/expenses/upload: "<user-uuid>/<timestamp>.<ext>"
const RECEIPT_PATH_RE = /^[0-9a-f-]{36}\/\d+\.(jpg|png|webp|heic|pdf)$/;

// ── POST /api/expenses ────────────────────────────────────────────────────
interface ExpenseBody {
  category: string;
  amount: number;
  expenseDate: string;
  description?: string | null;
  venueId?: string | null;
  // Storage path from /api/expenses/upload ("<user-id>/<ts>.jpg"), not a URL.
  receiptPath?: string | null;
  // Owner-only fields — ignored entirely when an employee is the caller.
  paidBy?: PaidBy;
  payerUserId?: string | null;
  relatedUserId?: string | null;
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  let body: ExpenseBody;
  try {
    body = (await request.json()) as ExpenseBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { category, amount, expenseDate, description, venueId, receiptPath } = body;

  const cleanAmount = money(amount, 1, 500_000);
  if (cleanAmount === null) {
    return NextResponse.json({ error: "Amount must be from 1 to 500,000" }, { status: 400 });
  }
  if (!isIsoDate(expenseDate)) {
    return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  }
  const cleanDescription = description === undefined || description === null ? "" : str(description, 200);
  if (cleanDescription === null) {
    return NextResponse.json({ error: "Description is too long (max 200 characters)" }, { status: 400 });
  }
  if (venueId !== undefined && venueId !== null && (typeof venueId !== "string" || venueId.length > 40)) {
    return NextResponse.json({ error: "Invalid venue" }, { status: 400 });
  }
  for (const id of [body.payerUserId, body.relatedUserId]) {
    if (id !== undefined && id !== null && !isUuid(id)) {
      return NextResponse.json({ error: "Invalid person selected" }, { status: 400 });
    }
  }

  const isOwner = session.role === "owner";

  let receiptStored: string | null = null;
  if (receiptPath !== undefined && receiptPath !== null) {
    if (typeof receiptPath !== "string" || !RECEIPT_PATH_RE.test(receiptPath)) {
      return NextResponse.json({ error: "Invalid receipt" }, { status: 400 });
    }
    if (!isOwner && !receiptPath.startsWith(`${session.userId}/`)) {
      return NextResponse.json({ error: "Invalid receipt" }, { status: 400 });
    }
    receiptStored = receiptPath;
  }

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
      amount: cleanAmount,
      description: cleanDescription || null,
      receipt_url: receiptStored,
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
    return error ? dbError(error) : fail(500, "Something went wrong. Try again.", "write returned no row");
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
