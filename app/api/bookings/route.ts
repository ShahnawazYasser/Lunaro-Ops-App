import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError, dataError, fail } from "@/lib/api";
import { getBookings } from "@/lib/data/bookings";
import { isIsoDate, money, str } from "@/lib/validate";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

// Optional text field: undefined/null → "", too long or not a string → undefined (invalid).
function optStr(v: unknown, maxLen: number): string | undefined {
  if (v === undefined || v === null) return "";
  return str(v, maxLen) ?? undefined;
}

// Paid client-event bookings (Phase F). Owner-only, every method.
//
// CASH BASIS revenue: see migration_bookings.sql / supabase_schema.sql for
// the full rule. amount_charged is the deal, not revenue; event_date and
// status play no role in revenue — only advance_date/final_date do, and
// only when their paired amount is set.

// ── GET /api/bookings?filter=upcoming|past|all ─────────────────────────────
export async function GET(request: NextRequest) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const filter = new URL(request.url).searchParams.get("filter") ?? "upcoming";
  if (filter !== "upcoming" && filter !== "past" && filter !== "all") {
    return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getBookings(filter));
  } catch (e) {
    return dataError(e);
  }
}

// ── POST /api/bookings ──────────────────────────────────────────────────────
interface BookingBody {
  clientName?: string;
  eventName?: string | null;
  package?: string | null;
  amountCharged?: number;
  eventDate?: string;
  notes?: string | null;
  advanceAmount?: number | null;
  advanceDate?: string | null;
}

export async function POST(request: NextRequest) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: BookingBody;
  try {
    body = (await request.json()) as BookingBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const clientName = str(body.clientName ?? "", 120);
  if (!clientName) {
    return NextResponse.json({ error: "Client name is required (max 120 characters)" }, { status: 400 });
  }

  const amountCharged = money(body.amountCharged, 1, 5_000_000);
  if (amountCharged === null) {
    return NextResponse.json({ error: "Amount charged must be from 1 to 5,000,000" }, { status: 400 });
  }

  const eventDate = body.eventDate;
  if (!isIsoDate(eventDate)) {
    return NextResponse.json({ error: "A valid event date is required" }, { status: 400 });
  }

  const eventName = optStr(body.eventName, 120);
  const pkg = optStr(body.package, 120);
  const notes = optStr(body.notes, 1000);
  if (eventName === undefined || pkg === undefined || notes === undefined) {
    return NextResponse.json({ error: "Event name, package or notes is too long" }, { status: 400 });
  }
  if (body.advanceDate && !isIsoDate(body.advanceDate)) {
    return NextResponse.json({ error: "Advance date isn't a valid date" }, { status: 400 });
  }

  // Advance is a complete amount+date pair or absent entirely.
  const hasAdvanceAmount = body.advanceAmount != null;
  const hasAdvanceDate = !!body.advanceDate;
  if (hasAdvanceAmount !== hasAdvanceDate) {
    return NextResponse.json(
      { error: "Advance needs both an amount and a date, or leave both blank" },
      { status: 400 }
    );
  }
  if (hasAdvanceAmount && money(body.advanceAmount, 1, 5_000_000) === null) {
    return NextResponse.json({ error: "Advance amount must be from 1 to 5,000,000" }, { status: 400 });
  }

  const advanceAmount = hasAdvanceAmount ? (body.advanceAmount as number) : null;
  if (advanceAmount != null && advanceAmount > amountCharged) {
    return NextResponse.json(
      { error: "Payments can't exceed the amount charged" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("bookings")
    .insert({
      client_name: clientName,
      event_name: eventName || null,
      package: pkg || null,
      amount_charged: amountCharged,
      event_date: eventDate,
      notes: notes || null,
      advance_amount: advanceAmount,
      advance_date: hasAdvanceDate ? body.advanceDate : null,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return error ? dbError(error) : fail(500, "Something went wrong. Try again.", "write returned no row");
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
