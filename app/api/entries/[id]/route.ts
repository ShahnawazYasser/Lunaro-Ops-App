import { NextRequest, NextResponse } from "next/server";
import { requireOwner, fail, dbError } from "@/lib/api";
import { parseEntryBody } from "@/lib/entry-input";
import { todayInKarachi } from "@/lib/dates";
import { supabaseAdmin, supabaseAsActor } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

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
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, "Invalid request body");
  }

  const parsed = parseEntryBody(raw);
  if (!parsed.ok) return fail(400, parsed.error);
  const body = parsed.value;

  if (body.entryDate > todayInKarachi()) return fail(400, "The date can't be in the future.");

  const { data: venue, error: venueError } = await supabaseAdmin
    .from("venues")
    .select("id")
    .eq("id", body.venueId)
    .maybeSingle();
  if (venueError) return dbError(venueError);
  if (!venue) return fail(400, "That venue doesn't exist. Pick one from the list.");

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("shift_entries")
    .select("id, user_id, entry_date")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return dbError(fetchError);
  if (!existing) return fail(404, "Entry not found");

  // Identity is immutable through this route.
  if (body.entryDate !== existing.entry_date) {
    return fail(400, "The date of an entry can't be changed. Delete it and create a new one instead.");
  }
  if (body.userId !== undefined && body.userId !== existing.user_id) {
    return fail(400, "The employee on an entry can't be changed.");
  }

  const { error: updateError } = await supabaseAsActor(session.userId)
    .from("shift_entries")
    .update({
      venue_id: body.venueId,
      event_name: body.venueId === "event" ? body.eventName : null,
      clock_in: body.clockIn,
      clock_out: body.clockOut,
      total_prints: body.totalPrints,
      extra_prints: body.extraPrints,
      system_prints_500: body.systemPrints500,
      system_prints_250: body.systemPrints250,
      free_prints: body.freePrints,
      waste_prints: body.wastePrints,
      price_charged: body.priceCharged,
      cash_received: body.cashReceived,
      bank_received: body.bankReceived,
      last_edited_by: session.userId,
      last_edited_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    // Venue is part of the uniqueness key (user + date + venue): moving this
    // entry onto a venue the same person already logged that day collides.
    if (updateError.code === "23505") {
      return fail(409, "That employee already has an entry for this venue on this date.");
    }
    return dbError(updateError);
  }

  // Replace expenses atomically (delete + insert in one DB transaction)
  const { error: replaceError } = await supabaseAdmin.rpc("replace_entry_expenses", {
    p_shift_entry_id: id,
    p_expenses: body.expenses,
  });

  if (replaceError) return dbError(replaceError);

  return NextResponse.json({ ok: true, entryId: id });
}
