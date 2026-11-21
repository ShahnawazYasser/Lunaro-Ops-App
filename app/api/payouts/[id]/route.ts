import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError } from "@/lib/api";
import { isIsoDate, money } from "@/lib/validate";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export const preferredRegion = "sin1";

type PayoutCycleUpdate = Database["public"]["Tables"]["payout_cycles"]["Update"];

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
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

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

  if (fetchError) return dbError(fetchError);
  if (!existing) return NextResponse.json({ error: "Payout cycle not found" }, { status: 404 });

  const update: PayoutCycleUpdate = {};

  if ("grossAmount" in body) {
    const grossAmount = body.grossAmount;
    if (grossAmount != null && money(grossAmount, 0, 50_000_000) === null) {
      return NextResponse.json({ error: "Gross amount must be from 0 to 50,000,000" }, { status: 400 });
    }
    update.gross_amount = grossAmount ?? null;
  }

  if ("rentDeducted" in body) {
    const rentDeducted = body.rentDeducted;
    if (money(rentDeducted, 0, 5_000_000) === null) {
      return NextResponse.json({ error: "Rent deducted must be from 0 to 5,000,000" }, { status: 400 });
    }
    update.rent_deducted = rentDeducted;
  }

  if ("payoutDue" in body) {
    if (body.payoutDue != null && !isIsoDate(body.payoutDue)) {
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
      if (!isIsoDate(body.receivedOn)) {
        return NextResponse.json({ error: "Received date must be a valid date" }, { status: 400 });
      }
      const receivedAmount = body.receivedAmount;
      if (money(receivedAmount, 1, 50_000_000) === null) {
        return NextResponse.json({ error: "Received amount must be from 1 to 50,000,000" }, { status: 400 });
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

  if (updateError) return dbError(updateError);

  return NextResponse.json({ ok: true, id });
}
