import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const preferredRegion = "sin1";

type PayoutCycleUpdate = Database["public"]["Tables"]["payout_cycles"]["Update"];

function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

interface PayoutPatchBody {
  grossAmount?: number | null;
  rentDeducted?: number;
  payoutDue?: string | null;
  receivedOn?: string | null;
  receivedAmount?: number | null;
}

// ── PATCH /api/payouts/[id] ──────────────────────────────────────────────
// Owner-only. Partial update: edit gross_amount / rent_deducted /
// payout_due independently, and/or mark-as-received (receivedOn +
// receivedAmount are a matched pair — both present or both absent, same
// as the DB's own check constraint, so an unmark clears both together).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: PayoutPatchBody;
  try {
    body = (await request.json()) as PayoutPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("payout_cycles")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Payout cycle not found" }, { status: 404 });

  const update: PayoutCycleUpdate = {};

  if ("grossAmount" in body) {
    const grossAmount = body.grossAmount;
    if (grossAmount != null && (typeof grossAmount !== "number" || !Number.isFinite(grossAmount) || grossAmount < 0)) {
      return NextResponse.json({ error: "Gross amount can't be negative" }, { status: 400 });
    }
    update.gross_amount = grossAmount ?? null;
  }

  if ("rentDeducted" in body) {
    const rentDeducted = body.rentDeducted;
    if (typeof rentDeducted !== "number" || !Number.isFinite(rentDeducted) || rentDeducted < 0) {
      return NextResponse.json({ error: "Rent deducted can't be negative" }, { status: 400 });
    }
    update.rent_deducted = rentDeducted;
  }

  if ("payoutDue" in body) {
    if (body.payoutDue != null && !isValidDate(body.payoutDue)) {
      return NextResponse.json({ error: "Payout date must be a valid date" }, { status: 400 });
    }
    update.payout_due = body.payoutDue ?? null;
  }

  const hasReceivedOn = "receivedOn" in body;
  const hasReceivedAmount = "receivedAmount" in body;
  if (hasReceivedOn || hasReceivedAmount) {
    if (hasReceivedOn !== hasReceivedAmount) {
      return NextResponse.json(
        { error: "Mark received needs both a date and an amount, or clear both together" },
        { status: 400 }
      );
    }
    const receivedOnIsNull = body.receivedOn == null;
    const receivedAmountIsNull = body.receivedAmount == null;
    if (receivedOnIsNull !== receivedAmountIsNull) {
      return NextResponse.json(
        { error: "Mark received needs both a date and an amount, or clear both together" },
        { status: 400 }
      );
    }
    if (!receivedOnIsNull) {
      if (!isValidDate(body.receivedOn)) {
        return NextResponse.json({ error: "Received date must be a valid date" }, { status: 400 });
      }
      const receivedAmount = body.receivedAmount;
      if (typeof receivedAmount !== "number" || !Number.isFinite(receivedAmount) || receivedAmount <= 0) {
        return NextResponse.json({ error: "Received amount must be greater than 0" }, { status: 400 });
      }
    }
    update.received_on = body.receivedOn ?? null;
    update.received_amount = body.receivedAmount ?? null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("payout_cycles")
    .update(update)
    .eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ ok: true, id });
}
