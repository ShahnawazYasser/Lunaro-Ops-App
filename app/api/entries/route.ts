import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

interface ExpenseInput {
  description: string;
  amount: number;
}

interface EntryBody {
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
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: EntryBody;
  try {
    body = (await request.json()) as EntryBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    entryDate,
    clockIn,
    clockOut,
    venueId,
    eventName,
    totalPrints,
    extraPrints,
    systemPrints500,
    systemPrints250,
    freePrints,
    wastePrints,
    cashReceived,
    bankReceived,
    expenses,
  } = body;

  if (!entryDate || !venueId) {
    return NextResponse.json({ error: "Date and venue are required" }, { status: 400 });
  }

  if (venueId === "event" && !eventName?.trim()) {
    return NextResponse.json({ error: "Event name is required" }, { status: 400 });
  }

  const userId = session.userId;

  // Check for existing entry for this user+date
  const { data: existing } = await supabaseAdmin
    .from("shift_entries")
    .select("id")
    .eq("user_id", userId)
    .eq("entry_date", entryDate)
    .maybeSingle();

  const entryFields = {
    user_id: userId,
    entry_date: entryDate,
    venue_id: venueId,
    event_name: venueId === "event" ? (eventName ?? null) : null,
    clock_in: clockIn ?? null,
    clock_out: clockOut ?? null,
    total_prints: totalPrints,
    extra_prints: extraPrints,
    system_prints_500: systemPrints500,
    system_prints_250: systemPrints250,
    free_prints: freePrints,
    waste_prints: wastePrints,
    cash_received: cashReceived,
    bank_received: bankReceived,
    notes: null,
  };

  let entryId: string;
  const isUpdate = existing !== null;

  if (isUpdate) {
    const { error: updateError } = await supabaseAdmin
      .from("shift_entries")
      .update(entryFields)
      .eq("id", existing.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    entryId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("shift_entries")
      .insert(entryFields)
      .select("id")
      .single();

    if (insertError || !inserted) {
      return NextResponse.json(
        { error: insertError?.message ?? "Insert failed" },
        { status: 500 }
      );
    }
    entryId = inserted.id;
  }

  // Replace expenses: delete all existing, re-insert
  const { error: deleteError } = await supabaseAdmin
    .from("entry_expenses")
    .delete()
    .eq("shift_entry_id", entryId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const validExpenses = expenses.filter(
    (e) => typeof e.description === "string" && e.description.trim() && e.amount > 0
  );

  if (validExpenses.length > 0) {
    const { error: expError } = await supabaseAdmin.from("entry_expenses").insert(
      validExpenses.map((e) => ({
        shift_entry_id: entryId,
        description: e.description.trim(),
        amount: e.amount,
      }))
    );

    if (expError) {
      return NextResponse.json({ error: expError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, entryId, updated: isUpdate }, { status: isUpdate ? 200 : 201 });
}
