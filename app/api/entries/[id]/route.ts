import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

interface ExpenseInput {
  description: string;
  amount: number;
}

interface EditBody {
  entryDate: string;
  clockIn: string | null;
  clockOut: string | null;
  venueId: string;
  eventName: string | null;
  totalPrints: number;
  extraPrints: number;
  systemPrints500: number;
  systemPrints250: number;
  freePrints: number;
  wastePrints: number;
  cashReceived: number;
  bankReceived: number;
  expenses: ExpenseInput[];
  // Optional — only ever sent to be validated against the stored row.
  userId?: string;
}

// PUT /api/entries/[id] — owner-only edit of an existing shift entry.
//
// The owner IS the finalizer, so this route deliberately bypasses the
// employee-facing cash_collected lock in POST /api/entries: a collected
// entry can still be corrected here. It cannot, however, change the
// entry's identity (user_id / entry_date) — moving an entry to a
// different person or date is a delete-and-recreate, not an edit.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: EditBody;
  try {
    body = (await request.json()) as EditBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.entryDate || !body.venueId) {
    return NextResponse.json({ error: "Date and venue are required" }, { status: 400 });
  }

  if (body.venueId === "event" && !body.eventName?.trim()) {
    return NextResponse.json({ error: "Event name is required" }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("shift_entries")
    .select("id, user_id, entry_date")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  // Identity is immutable through this route.
  if (body.entryDate !== existing.entry_date) {
    return NextResponse.json(
      { error: "The date of an entry can't be changed. Delete it and create a new one instead." },
      { status: 400 }
    );
  }
  if (body.userId !== undefined && body.userId !== existing.user_id) {
    return NextResponse.json(
      { error: "The employee on an entry can't be changed." },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("shift_entries")
    .update({
      venue_id: body.venueId,
      event_name: body.venueId === "event" ? (body.eventName ?? null) : null,
      clock_in: body.clockIn ?? null,
      clock_out: body.clockOut ?? null,
      total_prints: body.totalPrints,
      extra_prints: body.extraPrints,
      system_prints_500: body.systemPrints500,
      system_prints_250: body.systemPrints250,
      free_prints: body.freePrints,
      waste_prints: body.wastePrints,
      cash_received: body.cashReceived,
      bank_received: body.bankReceived,
      last_edited_by: session.userId,
      last_edited_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Replace expenses atomically (delete + insert in one DB transaction)
  const validExpenses = (body.expenses ?? []).filter(
    (e) => typeof e.description === "string" && e.description.trim() && e.amount > 0
  );

  const { error: replaceError } = await supabaseAdmin.rpc("replace_entry_expenses", {
    p_shift_entry_id: id,
    p_expenses: validExpenses.map((e) => ({
      description: e.description.trim(),
      amount: e.amount,
    })),
  });

  if (replaceError) return NextResponse.json({ error: replaceError.message }, { status: 500 });

  return NextResponse.json({ ok: true, entryId: id });
}
