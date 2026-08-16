import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { todayInKarachi } from "@/lib/dates";

// Paid client-event bookings (Phase F). Owner-only, every method.
//
// CASH BASIS revenue: see migration_bookings.sql / supabase_schema.sql for
// the full rule. amount_charged is the deal, not revenue; event_date and
// status play no role in revenue — only advance_date/final_date do, and
// only when their paired amount is set.

const SELECT = `
  id, client_name, event_name, package, amount_charged, event_date, notes,
  advance_amount, advance_date, final_amount, final_date,
  status, created_by, created_at, updated_at
`;

interface BookingRow {
  id: string;
  amount_charged: number;
  advance_amount: number | null;
  final_amount: number | null;
  [key: string]: unknown;
}

function withBalanceDue<T extends BookingRow>(row: T) {
  const received = (row.advance_amount ?? 0) + (row.final_amount ?? 0);
  return { ...row, balance_due: row.amount_charged - received };
}

// ── GET /api/bookings?filter=upcoming|past|all ─────────────────────────────
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const filter = searchParams.get("filter") ?? "upcoming";
  if (filter !== "upcoming" && filter !== "past" && filter !== "all") {
    return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  }

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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ bookings: (data ?? []).map((row) => withBalanceDue(row as BookingRow)) });
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
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: BookingBody;
  try {
    body = (await request.json()) as BookingBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const clientName = body.clientName?.trim();
  if (!clientName) {
    return NextResponse.json({ error: "Client name is required" }, { status: 400 });
  }

  const amountCharged = body.amountCharged;
  if (typeof amountCharged !== "number" || !Number.isFinite(amountCharged) || amountCharged <= 0) {
    return NextResponse.json({ error: "Amount charged must be greater than 0" }, { status: 400 });
  }

  const eventDate = body.eventDate;
  if (!eventDate || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    return NextResponse.json({ error: "A valid event date is required" }, { status: 400 });
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
  if (hasAdvanceAmount && (typeof body.advanceAmount !== "number" || body.advanceAmount <= 0)) {
    return NextResponse.json({ error: "Advance amount must be greater than 0" }, { status: 400 });
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
      event_name: body.eventName?.trim() || null,
      package: body.package?.trim() || null,
      amount_charged: amountCharged,
      event_date: eventDate,
      notes: body.notes?.trim() || null,
      advance_amount: advanceAmount,
      advance_date: hasAdvanceDate ? body.advanceDate : null,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
