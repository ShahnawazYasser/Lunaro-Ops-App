import { NextRequest, NextResponse } from "next/server";
import { requireOwner, requireSession, fail, dbError } from "@/lib/api";
import { parseEntryBody } from "@/lib/entry-input";
import { supabaseAdmin, supabaseAsActor } from "@/lib/supabase/server";
import { addDays, monthRange, todayInKarachi } from "@/lib/dates";
import { isMonth } from "@/lib/validate";

export const preferredRegion = "sin1";

// GET /api/entries?month=2026-06 — owner-only log of all shift entries
export async function GET(request: NextRequest) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");

  if (!month || !isMonth(month)) {
    return fail(400, "Invalid month (expected YYYY-MM)");
  }

  const { startDate, endDate } = monthRange(month);

  // Shift-linked expenses now live in the unified `expenses` table (Phase D),
  // joined on shift_entry_id. Aliased back to `entry_expenses` so the
  // response shape EntriesClient reads is unchanged.
  const { data, error } = await supabaseAdmin
    .from("shift_entries")
    .select(`
      id, user_id, entry_date, venue_id, event_name,
      total_prints, extra_prints, system_prints_500, system_prints_250,
      free_prints, waste_prints, price_charged, cash_received, bank_received,
      clock_in, clock_out, notes, cash_collected, cash_collected_at,
      last_edited_by, last_edited_at,
      created_at,
      users!shift_entries_user_id_fkey!inner(name),
      venues!inner(name),
      entry_expenses:expenses(description, amount, category)
    `)
    .gte("entry_date", startDate)
    .lte("entry_date", endDate)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) return dbError(error);

  return NextResponse.json({ entries: data ?? [] });
}

export async function POST(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, "Invalid request body");
  }

  const parsed = parseEntryBody(raw);
  if (!parsed.ok) return fail(400, parsed.error);
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
    priceCharged,
    cashReceived,
    bankReceived,
    expenses,
  } = parsed.value;

  // Date window (Asia/Karachi). Employees: today or up to 2 days back.
  // Owner: any past date. Nobody: the future.
  const today = todayInKarachi();
  if (entryDate > today) return fail(400, "The date can't be in the future.");
  if (session.role !== "owner" && entryDate < addDays(today, -2)) {
    return fail(400, "You can only log today or the last 2 days. Ask the owner to add older entries.");
  }

  const { data: venue, error: venueError } = await supabaseAdmin
    .from("venues")
    .select("id")
    .eq("id", venueId)
    .maybeSingle();
  if (venueError) return dbError(venueError);
  if (!venue) return fail(400, "That venue doesn't exist. Pick one from the list.");

  const userId = session.userId;

  // Check for existing entry for this user+date+venue (the uniqueness key
  // since migration_entry_audit.sql — one person may log two venues in a day).
  //
  // The lock: once the owner has touched a row — either by marking the cash
  // collected, or by editing it via PUT /api/entries/[id] — employee
  // resubmission for that user+date is permanently rejected. Without it, an
  // upsert on (user_id, entry_date) would silently overwrite the owner's
  // reconciled figures. Owner edits go through PUT, which bypasses this.
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("shift_entries")
    .select("id, cash_collected, last_edited_by")
    .eq("user_id", userId)
    .eq("entry_date", entryDate)
    .eq("venue_id", venueId)
    .maybeSingle();
  if (existingError) return dbError(existingError);

  if (existing?.cash_collected || existing?.last_edited_by) {
    return fail(409, "This entry has been finalized by the owner. Contact them to make changes.");
  }

  const entryFields = {
    user_id: userId,
    entry_date: entryDate,
    venue_id: venueId,
    event_name: venueId === "event" ? eventName : null,
    clock_in: clockIn,
    clock_out: clockOut,
    total_prints: totalPrints,
    extra_prints: extraPrints,
    system_prints_500: systemPrints500,
    system_prints_250: systemPrints250,
    free_prints: freePrints,
    waste_prints: wastePrints,
    price_charged: priceCharged,
    cash_received: cashReceived,
    bank_received: bankReceived,
    notes: null,
  };

  // Writes to shift_entries go through the actor-tagged client so the audit
  // trigger records who made the change.
  const db = supabaseAsActor(userId);

  let entryId: string;
  const isUpdate = existing !== null;

  if (isUpdate) {
    const { error: updateError } = await db
      .from("shift_entries")
      .update(entryFields)
      .eq("id", existing.id);

    if (updateError) return dbError(updateError);
    entryId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await db
      .from("shift_entries")
      .insert(entryFields)
      .select("id")
      .single();

    if (insertError || !inserted) {
      return insertError ? dbError(insertError) : fail(500, "Something went wrong. Try again.", "entry insert returned no row");
    }
    entryId = inserted.id;
  }

  // Replace expenses atomically (delete + insert in one DB transaction)
  const { error: replaceError } = await supabaseAdmin.rpc("replace_entry_expenses", {
    p_shift_entry_id: entryId,
    p_expenses: expenses,
  });

  if (replaceError) return dbError(replaceError);

  return NextResponse.json({ ok: true, entryId, updated: isUpdate }, { status: isUpdate ? 200 : 201 });
}
