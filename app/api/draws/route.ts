import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
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
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const month = new URL(request.url).searchParams.get("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ draws: data ?? [] });
}

// ── POST /api/draws ───────────────────────────────────────────────────────
interface DrawBody {
  amount: number;
  expenseDate: string;
  description?: string | null;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: DrawBody;
  try {
    body = (await request.json()) as DrawBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { amount, expenseDate, description } = body;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }
  if (!expenseDate || !/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) {
    return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("expenses")
    .insert({
      expense_date: expenseDate,
      category: OWNER_DRAW_CATEGORY,
      amount,
      description: description?.trim() || null,
      paid_by: "company",
      payer_user_id: null,
      reimbursement_status: null,
      is_owner_draw: true,
      logged_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
