import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isCategory } from "@/lib/categories";

export const preferredRegion = "sin1";

// Recurring fixed costs (rent, subscriptions). Owner-only, every method.
// These are templates, not expenses: nothing here creates `expenses` rows.
// The dashboard reads active venue-linked ones for its rent-coverage warning.
const SELECT = "id, name, category, amount, due_day, venue_id, active, venues(name)";

// ── GET /api/recurring ────────────────────────────────────────────────────
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("recurring_expenses")
    .select(SELECT)
    .order("active", { ascending: false })
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

// ── POST /api/recurring ───────────────────────────────────────────────────
interface RecurringBody {
  name: string;
  category: string;
  amount: number;
  dueDay: number;
  venueId?: string | null;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: RecurringBody;
  try {
    body = (await request.json()) as RecurringBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, category, amount, dueDay, venueId } = body;
  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (!isCategory(category)) {
    return NextResponse.json({ error: "Pick a valid category" }, { status: 400 });
  }
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
  }
  if (typeof dueDay !== "number" || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) {
    return NextResponse.json({ error: "Day of month must be between 1 and 28" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("recurring_expenses")
    .insert({
      name: name.trim(),
      category,
      amount,
      due_day: dueDay,
      venue_id: venueId || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
