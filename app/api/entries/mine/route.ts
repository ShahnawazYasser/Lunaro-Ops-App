import { NextRequest, NextResponse } from "next/server";
import { requireSession, fail, dbError } from "@/lib/api";
import { EDIT_WINDOW_DAYS } from "@/lib/entry-input";
import { supabaseAdmin } from "@/lib/supabase/server";
import { addDays, currentMonthInKarachi, monthRange, todayInKarachi } from "@/lib/dates";
import { isMonth } from "@/lib/validate";

export const preferredRegion = "sin1";

// GET /api/entries/mine?month=YYYY-MM — any role. ONLY the signed-in user's
// own entries. There is deliberately no user id parameter: whatever a caller
// sends is ignored, the session decides whose entries these are.
export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const monthParam = new URL(request.url).searchParams.get("month");
  if (monthParam !== null && !isMonth(monthParam)) return fail(400, "Invalid month (expected YYYY-MM)");
  const month = monthParam ?? currentMonthInKarachi();
  const { startDate, endDate } = monthRange(month);

  const [entriesRes, datesRes] = await Promise.all([
    supabaseAdmin
      .from("shift_entries")
      .select(`
        id, entry_date, venue_id, event_name,
        total_prints, extra_prints, system_prints_500, system_prints_250,
        free_prints, waste_prints, price_charged, cash_received, bank_received,
        clock_in, clock_out, notes, cash_collected, cash_collected_at,
        last_edited_by, last_edited_at, created_at,
        venues!inner(name),
        entry_expenses:expenses(description, amount, category)
      `)
      .eq("user_id", session.userId)
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    // Every date this person has an entry on — only used for the month list.
    supabaseAdmin
      .from("shift_entries")
      .select("entry_date")
      .eq("user_id", session.userId)
      .order("entry_date", { ascending: false }),
  ]);

  if (entriesRes.error) return dbError(entriesRes.error);
  if (datesRes.error) return dbError(datesRes.error);

  const oldestEditable = addDays(todayInKarachi(), -EDIT_WINDOW_DAYS);

  const entries = (entriesRes.data ?? []).map((e) => ({
    ...e,
    collected: e.cash_collected,
    // Not collected, never touched by the owner, and recent enough.
    editable: !e.cash_collected && e.last_edited_by === null && e.entry_date >= oldestEditable,
  }));

  const summary = {
    shifts: entries.length,
    cashReceived: entries.reduce((s, e) => s + e.cash_received, 0),
    bankReceived: entries.reduce((s, e) => s + e.bank_received, 0),
    totalPrints: entries.reduce((s, e) => s + e.total_prints, 0),
    // Cash the person is still holding for the owner (this month's entries not yet collected).
    cashNotYetCollected: entries.filter((e) => !e.cash_collected).reduce((s, e) => s + e.cash_received, 0),
  };

  const availableMonths = [...new Set((datesRes.data ?? []).map((r) => r.entry_date.slice(0, 7)))];

  return NextResponse.json({ entries, summary, availableMonths });
}
