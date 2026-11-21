import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError, fail } from "@/lib/api";
import { isIsoDate, isMonth, money, str } from "@/lib/validate";
import { supabaseAdmin } from "@/lib/supabase/server";
import { monthRange } from "@/lib/dates";

export const preferredRegion = "sin1";

// Owner draws: money the owner pulls out of the business for personal use.
// Stored as rows in `expenses` with is_owner_draw = true so the cash trail
// stays in one table, but they are NOT business costs — every P&L query
// (dashboard, /api/expenses) filters them out. Owner-only, every method.
const OWNER_DRAW_CATEGORY = "Owner Draw";

const SELECT = "id, expense_date, amount, description, created_at";

// ── GET /api/draws?month=2026-08 ──────────────────────────────────────────
export async function GET(request: NextRequest) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const month = new URL(request.url).searchParams.get("month");
  if (!month || !isMonth(month)) {
    return NextResponse.json({ error: "Invalid month format (expected YYYY-MM)" }, { status: 400 });
  }
  const { startDate, endDate } = monthRange(month);

  const { data, error } = await supabaseAdmin
    .from("expenses")
    .select(SELECT)
    .eq("is_owner_draw", true)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return dbError(error);
  return NextResponse.json({ draws: data ?? [] });
}

// ── POST /api/draws ───────────────────────────────────────────────────────
interface DrawBody {
  amount: number;
  expenseDate: string;
  description?: string | null;
}

export async function POST(request: NextRequest) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: DrawBody;
  try {
    body = (await request.json()) as DrawBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { amount, expenseDate, description } = body;
  const cleanAmount = money(amount, 1, 5_000_000);
  if (cleanAmount === null) {
    return NextResponse.json({ error: "Amount must be from 1 to 5,000,000" }, { status: 400 });
  }
  if (!isIsoDate(expenseDate)) {
    return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  }
  const cleanDescription = description === undefined || description === null ? "" : str(description, 200);
  if (cleanDescription === null) {
    return NextResponse.json({ error: "Description is too long (max 200 characters)" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("expenses")
    .insert({
      expense_date: expenseDate,
      category: OWNER_DRAW_CATEGORY,
      amount: cleanAmount,
      description: cleanDescription || null,
      paid_by: "company",
      payer_user_id: null,
      reimbursement_status: null,
      is_owner_draw: true,
      logged_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return error ? dbError(error) : fail(500, "Something went wrong. Try again.", "write returned no row");
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
