import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ReimbursementCategory } from "@/lib/supabase/types";

// ── GET /api/reimbursements?month=2026-06&userId=all ──────────────────────
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month"); // e.g. "2026-06"
  const userId = searchParams.get("userId"); // "all" or a UUID

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Invalid month format (expected YYYY-MM)" }, { status: 400 });
  }

  const [year, mon] = month.split("-");
  const startDate = `${year}-${mon}-01`;
  // Last day of month
  const endDate = new Date(Number(year), Number(mon), 0)
    .toISOString()
    .split("T")[0];

  let query = supabaseAdmin
    .from("reimbursements")
    .select(`
      id, user_id, category, amount, description,
      receipt_url, status, expense_date, venue_id,
      created_at,
      users!inner(name),
      venues(name)
    `)
    .gte("expense_date", startDate)
    .lte("expense_date", endDate)
    .order("expense_date", { ascending: false });

  if (userId && userId !== "all") {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ reimbursements: data ?? [] });
}

// ── POST /api/reimbursements ──────────────────────────────────────────────
interface ReimbursementBody {
  category: ReimbursementCategory;
  amount: number;
  venueId: string | null;
  expenseDate: string;
  note: string;
  receiptUrl: string | null;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: ReimbursementBody;
  try {
    body = (await request.json()) as ReimbursementBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { category, amount, venueId, expenseDate, note, receiptUrl } = body;

  if (!category || !["Petrol", "Food", "Misc"].includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }
  if (!expenseDate) {
    return NextResponse.json({ error: "Date is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("reimbursements")
    .insert({
      user_id: session.userId,
      category,
      amount,
      venue_id: venueId ?? null,
      expense_date: expenseDate,
      description: note.trim() || null,
      receipt_url: receiptUrl ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
