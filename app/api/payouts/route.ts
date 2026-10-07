import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

// Venue payout cycles (Chunk 4). Owner-only, every method.
//
// payout_due is a manual date, not computed — Lanes' actual payout date
// varies from the "within ~10 days" estimate, so it's entered by hand
// once known (see migration_payout_due_manual.sql). Rent is deducted from
// whichever cycle it lands in (rent_deducted), not on a fixed monthly day.

const SELECT = `
  id, venue_id, cycle_start, cycle_end, payout_due, gross_amount, rent_deducted,
  received_on, received_amount, venues(name)
`;

function isValidDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// ── GET /api/payouts ─────────────────────────────────────────────────────
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("payout_cycles")
    .select(SELECT)
    .order("cycle_start", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ cycles: data ?? [] });
}

// ── POST /api/payouts ────────────────────────────────────────────────────
interface PayoutCycleBody {
  venueId?: string;
  cycleStart?: string;
  cycleEnd?: string;
  grossAmount?: number | null;
  rentDeducted?: number;
  payoutDue?: string | null;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: PayoutCycleBody;
  try {
    body = (await request.json()) as PayoutCycleBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const venueId = body.venueId?.trim();
  if (!venueId) {
    return NextResponse.json({ error: "Venue is required" }, { status: 400 });
  }
  if (!isValidDate(body.cycleStart)) {
    return NextResponse.json({ error: "A valid cycle start date is required" }, { status: 400 });
  }
  if (!isValidDate(body.cycleEnd)) {
    return NextResponse.json({ error: "A valid cycle end date is required" }, { status: 400 });
  }
  if (body.cycleEnd < body.cycleStart) {
    return NextResponse.json({ error: "Cycle end can't be before cycle start" }, { status: 400 });
  }

  const grossAmount = body.grossAmount;
  if (grossAmount != null && (typeof grossAmount !== "number" || !Number.isFinite(grossAmount) || grossAmount < 0)) {
    return NextResponse.json({ error: "Gross amount can't be negative" }, { status: 400 });
  }

  const rentDeducted = body.rentDeducted ?? 0;
  if (typeof rentDeducted !== "number" || !Number.isFinite(rentDeducted) || rentDeducted < 0) {
    return NextResponse.json({ error: "Rent deducted can't be negative" }, { status: 400 });
  }

  if (body.payoutDue != null && !isValidDate(body.payoutDue)) {
    return NextResponse.json({ error: "Payout date must be a valid date" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("payout_cycles")
    .insert({
      venue_id: venueId,
      cycle_start: body.cycleStart,
      cycle_end: body.cycleEnd,
      gross_amount: grossAmount ?? null,
      rent_deducted: rentDeducted,
      payout_due: body.payoutDue ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
