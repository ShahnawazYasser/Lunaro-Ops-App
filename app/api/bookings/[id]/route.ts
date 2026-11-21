import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError } from "@/lib/api";
import { isIsoDate, money, str } from "@/lib/validate";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { BookingStatus } from "@/lib/supabase/types";

export const preferredRegion = "sin1";

// Optional text field: undefined/null → "", too long or not a string → undefined (invalid).
function optStr(v: unknown, maxLen: number): string | undefined {
  if (v === undefined || v === null) return "";
  return str(v, maxLen) ?? undefined;
}

const VALID_STATUSES: BookingStatus[] = ["upcoming", "completed", "cancelled"];

interface BookingBody {
  clientName?: string;
  eventName?: string | null;
  package?: string | null;
  amountCharged?: number;
  eventDate?: string;
  notes?: string | null;
  advanceAmount?: number | null;
  advanceDate?: string | null;
  finalAmount?: number | null;
  finalDate?: string | null;
  status?: BookingStatus;
}

// ── PUT /api/bookings/[id] ──────────────────────────────────────────────────
// Owner-only. Edits any field, including status and both payment pairs.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

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

  const status = body.status ?? "upcoming";
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Each payment is a complete amount+date pair, or absent entirely.
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

  const hasFinalAmount = body.finalAmount != null;
  const hasFinalDate = !!body.finalDate;
  if (hasFinalAmount !== hasFinalDate) {
    return NextResponse.json(
      { error: "Final payment needs both an amount and a date, or leave both blank" },
      { status: 400 }
    );
  }
  if (body.finalDate && !isIsoDate(body.finalDate)) {
    return NextResponse.json({ error: "Final payment date isn't a valid date" }, { status: 400 });
  }
  if (hasFinalAmount && money(body.finalAmount, 1, 5_000_000) === null) {
    return NextResponse.json({ error: "Final payment amount must be from 1 to 5,000,000" }, { status: 400 });
  }

  const advanceAmount = hasAdvanceAmount ? (body.advanceAmount as number) : null;
  const finalAmount = hasFinalAmount ? (body.finalAmount as number) : null;
  const received = (advanceAmount ?? 0) + (finalAmount ?? 0);
  if (received > amountCharged) {
    return NextResponse.json(
      { error: "Payments can't exceed the amount charged" },
      { status: 400 }
    );
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return dbError(fetchError);
  if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const { error: updateError } = await supabaseAdmin
    .from("bookings")
    .update({
      client_name: clientName,
      event_name: eventName || null,
      package: pkg || null,
      amount_charged: amountCharged,
      event_date: eventDate,
      notes: notes || null,
      advance_amount: advanceAmount,
      advance_date: hasAdvanceDate ? body.advanceDate : null,
      final_amount: finalAmount,
      final_date: hasFinalDate ? body.finalDate : null,
      status,
    })
    .eq("id", id);

  if (updateError) return dbError(updateError);

  return NextResponse.json({ ok: true, id });
}

// ── DELETE /api/bookings/[id] ───────────────────────────────────────────────
// Owner-only. Hard delete.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return dbError(fetchError);
  if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const { error: deleteError } = await supabaseAdmin.from("bookings").delete().eq("id", id);
  if (deleteError) return dbError(deleteError);

  return NextResponse.json({ ok: true, id });
}
