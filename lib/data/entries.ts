import { supabaseAdmin } from "@/lib/supabase/server";
import { EDIT_WINDOW_DAYS } from "@/lib/entry-input";
import { addDays, monthRange, todayInKarachi } from "@/lib/dates";
import { check } from "./errors";

// Owner: every shift entry for the month, with audit counts.
export async function getEntries(month: string) {
  const { startDate, endDate } = monthRange(month);

  // Shift-linked expenses live in the unified `expenses` table, joined on
  // shift_entry_id and aliased back to `entry_expenses` for the client.
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
  check(error);

  // How many changes each entry has in its history (the insert counts as 1), so
  // the list can flag entries changed after they were first saved.
  const entries = data ?? [];
  const auditCounts = new Map<string, number>();
  if (entries.length > 0) {
    const { data: auditRows, error: auditError } = await supabaseAdmin
      .from("entry_audit")
      .select("entry_id")
      .in("entry_id", entries.map((e) => e.id));
    check(auditError);
    for (const r of auditRows ?? []) auditCounts.set(r.entry_id, (auditCounts.get(r.entry_id) ?? 0) + 1);
  }

  return { entries: entries.map((e) => ({ ...e, audit_count: auditCounts.get(e.id) ?? 0 })) };
}

// Only the given user's own entries. The caller passes the SESSION user id —
// there is deliberately no way for a client to choose whose entries these are.
export async function getMyEntries(userId: string, month: string) {
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
      .eq("user_id", userId)
      .gte("entry_date", startDate)
      .lte("entry_date", endDate)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false }),
    // Every date this person has an entry on — only used for the month list.
    supabaseAdmin
      .from("shift_entries")
      .select("entry_date")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false }),
  ]);
  check(entriesRes.error);
  check(datesRes.error);

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

  return { entries, summary, availableMonths };
}
