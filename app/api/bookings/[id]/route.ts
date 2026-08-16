import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { BookingStatus } from "@/lib/supabase/types";

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
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

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
  if (hasAdvanceAmount && (typeof body.advanceAmount !== "number" || body.advanceAmount <= 0)) {
    return NextResponse.json({ error: "Advance amount must be greater than 0" }, { status: 400 });
  }

  const hasFinalAmount = body.finalAmount != null;
  const hasFinalDate = !!body.finalDate;
  if (hasFinalAmount !== hasFinalDate) {
    return NextResponse.json(
      { error: "Final payment needs both an amount and a date, or leave both blank" },
      { status: 400 }
    );
  }
  if (hasFinalAmount && (typeof body.finalAmount !== "number" || body.finalAmount <= 0)) {
    return NextResponse.json({ error: "Final payment amount must be greater than 0" }, { status: 400 });
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

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const { error: updateError } = await supabaseAdmin
    .from("bookings")
    .update({
      client_name: clientName,
      event_name: body.eventName?.trim() || null,
      package: body.package?.trim() || null,
      amount_charged: amountCharged,
      event_date: eventDate,
      notes: body.notes?.trim() || null,
      advance_amount: advanceAmount,
      advance_date: hasAdvanceDate ? body.advanceDate : null,
      final_amount: finalAmount,
      final_date: hasFinalDate ? body.finalDate : null,
      status,
    })
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}

// ── DELETE /api/bookings/[id] ───────────────────────────────────────────────
// Owner-only. Hard delete.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("bookings")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Booking not found" }, { status: 404 });

  const { error: deleteError } = await supabaseAdmin.from("bookings").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}
