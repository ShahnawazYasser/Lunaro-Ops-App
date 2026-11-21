import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError, fail } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isCategory } from "@/lib/categories";
import { int, money, str } from "@/lib/validate";

export const preferredRegion = "sin1";

// Recurring fixed costs (rent, subscriptions). Owner-only, every method.
// These are templates, not expenses: nothing here creates `expenses` rows.
// The dashboard reads active venue-linked ones for its rent-coverage warning.
const SELECT = "id, name, category, amount, due_day, venue_id, active, venues(name)";

// ── GET /api/recurring ────────────────────────────────────────────────────
export async function GET() {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { data, error } = await supabaseAdmin
    .from("recurring_expenses")
    .select(SELECT)
    .order("active", { ascending: false })
    .order("name");

  if (error) return dbError(error);
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
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: RecurringBody;
  try {
    body = (await request.json()) as RecurringBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, category, amount, dueDay, venueId } = body;
  const cleanName = str(name, 120);
  if (!cleanName) {
    return NextResponse.json({ error: "Name is required (max 120 characters)" }, { status: 400 });
  }
  if (!isCategory(category)) {
    return NextResponse.json({ error: "Pick a valid category" }, { status: 400 });
  }
  const cleanAmount = money(amount, 1, 5_000_000);
  if (cleanAmount === null) {
    return NextResponse.json({ error: "Amount must be from 1 to 5,000,000" }, { status: 400 });
  }
  if (int(dueDay, 1, 28) === null) {
    return NextResponse.json({ error: "Day of month must be between 1 and 28" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("recurring_expenses")
    .insert({
      name: cleanName,
      category,
      amount: cleanAmount,
      due_day: dueDay,
      venue_id: venueId || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return error ? dbError(error) : fail(500, "Something went wrong. Try again.", "write returned no row");
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
