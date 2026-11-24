import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { monthRange } from "@/lib/dates";
import { appliesInMonth } from "@/lib/fixed-costs";
import { isMonth } from "@/lib/validate";

export const preferredRegion = "sin1";

// POST /api/recurring/post  { month: "YYYY-MM" }
// Owner-only. Turns each fixed cost that applies to the month into one company
// expense dated the 1st. Payout venues (collects_payments) are never posted:
// their rent is taken out of the payout. Safe to press twice: the database has
// a unique index on (recurring_id, recurring_month), so a repeat is skipped.
export async function POST(request: NextRequest) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: { month?: unknown };
  try {
    body = (await request.json()) as { month?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (typeof body.month !== "string" || !isMonth(body.month)) {
    return NextResponse.json({ error: "Pick a valid month" }, { status: 400 });
  }
  const { startDate, endDate } = monthRange(body.month);

  const [
    { data: recs, error: recErr },
    { data: venues, error: venueErr },
    { data: posted, error: postedErr },
  ] = await Promise.all([
    supabaseAdmin
      .from("recurring_expenses")
      .select("id, name, category, amount, venue_id, active, starts_on, ends_on")
      .eq("active", true),
    supabaseAdmin.from("venues").select("id, collects_payments"),
    supabaseAdmin
      .from("expenses")
      .select("recurring_id")
      .eq("recurring_month", startDate)
      .not("recurring_id", "is", null),
  ]);
  if (recErr) return dbError(recErr);
  if (venueErr) return dbError(venueErr);
  if (postedErr) return dbError(postedErr);

  const payoutVenues = new Set((venues ?? []).filter((v) => v.collects_payments).map((v) => v.id));
  const alreadyPosted = new Set((posted ?? []).map((r) => r.recurring_id));

  let postedCount = 0;
  let skipped = 0;

  for (const rec of recs ?? []) {
    if (!appliesInMonth(rec, startDate, endDate)) continue;
    if (rec.venue_id && payoutVenues.has(rec.venue_id)) continue; // never posted
    if (alreadyPosted.has(rec.id)) {
      skipped++;
      continue;
    }

    const { error } = await supabaseAdmin.from("expenses").insert({
      expense_date: startDate,
      category: rec.category,
      amount: rec.amount,
      description: `${rec.name} (fixed cost)`,
      paid_by: "company",
      venue_id: rec.venue_id,
      recurring_id: rec.id,
      recurring_month: startDate,
      logged_by: session.userId,
    });

    if (!error) {
      postedCount++;
    } else if (error.code === "23505") {
      skipped++; // a parallel press got there first — the unique index held
    } else {
      return dbError(error);
    }
  }

  return NextResponse.json({ posted: postedCount, skipped });
}
