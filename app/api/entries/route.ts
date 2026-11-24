import { NextRequest, NextResponse } from "next/server";
import { requireOwner, requireSession, fail, dbError, dataError } from "@/lib/api";
import { getEntries } from "@/lib/data/entries";
import { EDIT_WINDOW_DAYS, entryRecord, parseEntryBody } from "@/lib/entry-input";
import { supabaseAdmin, supabaseAsActor } from "@/lib/supabase/server";
import { addDays, formatDate, todayInKarachi } from "@/lib/dates";
import { isMonth, isUuid } from "@/lib/validate";

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

  try {
    return NextResponse.json(await getEntries(month));
  } catch (e) {
    return dataError(e);
  }
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
  const { entryDate, venueId, expenses } = parsed.value;

  const userId = session.userId;
  const today = todayInKarachi();

  // `entryId` present = a deliberate edit of one of the caller's own entries
  // (My entries). Absent = a new entry; it may NOT silently overwrite one.
  const rawEntryId = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>)["entryId"] : undefined;
  if (rawEntryId !== undefined && rawEntryId !== null && !isUuid(rawEntryId)) return fail(400, "Invalid entry.");
  const entryIdFromClient = typeof rawEntryId === "string" ? rawEntryId : null;

  const { data: venue, error: venueError } = await supabaseAdmin
    .from("venues")
    .select("id, name")
    .eq("id", venueId)
    .maybeSingle();
  if (venueError) return dbError(venueError);
  if (!venue) return fail(400, "That venue doesn't exist. Pick one from the list.");

  // The lock: once the owner has touched a row — marked the cash collected, or
  // edited it via PUT /api/entries/[id] — the employee can never change it
  // again. Owner edits go through PUT, which bypasses this.
  const LOCKED = "This entry has been finalized by the owner. Contact them to make changes.";

  let existingId: string | null = null;

  if (entryIdFromClient) {
    // ── Editing: the row must be the caller's own, unlocked, and recent ──
    const { data: own, error: ownError } = await supabaseAdmin
      .from("shift_entries")
      .select("id, user_id, entry_date, cash_collected, last_edited_by")
      .eq("id", entryIdFromClient)
      .maybeSingle();
    if (ownError) return dbError(ownError);
    if (!own || own.user_id !== userId) return fail(404, "Entry not found");
    if (own.cash_collected || own.last_edited_by) return fail(409, LOCKED);
    if (entryDate !== own.entry_date) return fail(400, "The date of an entry can't be changed.");
    if (own.entry_date < addDays(today, -EDIT_WINDOW_DAYS)) {
      return fail(409, `Entries older than ${EDIT_WINDOW_DAYS} days can't be changed. Ask the owner.`);
    }
    existingId = own.id;
  } else {
    // ── New entry: date window (Asia/Karachi). Employees: today or up to
    // 2 days back. Owner: any past date. Nobody: the future. ──
    if (entryDate > today) return fail(400, "The date can't be in the future.");
    if (session.role !== "owner" && entryDate < addDays(today, -2)) {
      return fail(400, "You can only log today or the last 2 days. Ask the owner to add older entries.");
    }

    // One row per user + date + venue (migration_entry_audit.sql). A second
    // submission for the same one is refused, never merged into the first.
    const { data: dup, error: dupError } = await supabaseAdmin
      .from("shift_entries")
      .select("id")
      .eq("user_id", userId)
      .eq("entry_date", entryDate)
      .eq("venue_id", venueId)
      .maybeSingle();
    if (dupError) return dbError(dupError);
    if (dup) {
      return fail(409, `You already logged ${venue.name} for ${formatDate(entryDate)}. Open it in My entries to change it.`);
    }
  }

  // One transaction: the shift row AND its expenses are saved together or not
  // at all (save_shift_entry, migration_save_shift_entry.sql). Called through
  // the actor-tagged client so the audit trigger records who made the change.
  const isUpdate = existingId !== null;
  const { data: entryId, error: saveError } = await supabaseAsActor(userId).rpc("save_shift_entry", {
    p_entry: { ...entryRecord(parsed.value), user_id: userId, entry_date: entryDate },
    p_expenses: expenses,
    p_entry_id: existingId,
  });

  if (saveError || !entryId) {
    return saveError ? dbError(saveError) : fail(500, "Something went wrong. Try again.", "save_shift_entry returned no id");
  }

  return NextResponse.json({ ok: true, entryId, updated: isUpdate }, { status: isUpdate ? 200 : 201 });
}
