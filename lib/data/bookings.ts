import { supabaseAdmin } from "@/lib/supabase/server";
import { todayInKarachi } from "@/lib/dates";
import { check } from "./errors";

export type BookingFilter = "upcoming" | "past" | "all";

// CASH BASIS revenue: amount_charged is the deal, not revenue; event_date and
// status play no role in revenue — only advance_date/final_date do (see
// db/migration_bookings.sql).
const SELECT = `
  id, client_name, event_name, package, amount_charged, event_date, notes,
  advance_amount, advance_date, final_amount, final_date,
  status, created_by, created_at, updated_at
`;

// Display status is derived, not stored: nobody maintains the column, so only
// 'cancelled' is read from it. Otherwise past events are 'completed' and the
// rest are 'upcoming' (Karachi calendar day).
function displayStatus(status: string, eventDate: string, today: string): "upcoming" | "completed" | "cancelled" {
  if (status === "cancelled") return "cancelled";
  return eventDate < today ? "completed" : "upcoming";
}

export async function getBookings(filter: BookingFilter) {
  const today = todayInKarachi();

  let query = supabaseAdmin.from("bookings").select(SELECT);
  if (filter === "upcoming") {
    query = query.gte("event_date", today).neq("status", "cancelled").order("event_date", { ascending: true });
  } else if (filter === "past") {
    // Everything not "upcoming": past-dated, or cancelled regardless of date.
    query = query.or(`event_date.lt.${today},status.eq.cancelled`).order("event_date", { ascending: false });
  } else {
    query = query.order("event_date", { ascending: false });
  }

  const { data, error } = await query;
  check(error);

  return {
    bookings: (data ?? []).map((row) => {
      const received = (row.advance_amount ?? 0) + (row.final_amount ?? 0);
      return {
        ...row,
        status: displayStatus(row.status, row.event_date, today),
        balance_due: row.amount_charged - received,
      };
    }),
  };
}
