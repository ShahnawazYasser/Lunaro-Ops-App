import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError, dataError, fail } from "@/lib/api";
import { getAssets } from "@/lib/data/assets";
import { int, isIsoDate, money, str } from "@/lib/validate";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

// Assets + straight-line depreciation (Chunk 2). Owner-only, every method.

// ── GET /api/assets ─────────────────────────────────────────────────────────
export async function GET() {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  try {
    return NextResponse.json(await getAssets());
  } catch (e) {
    return dataError(e);
  }
}

// ── POST /api/assets ─────────────────────────────────────────────────────────
interface AssetBody {
  name: string;
  cost: number;
  purchaseDate: string;
  usefulLifeMonths: number;
  salvageValue?: number;
  venueId?: string | null;
}

export async function POST(request: NextRequest) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: AssetBody;
  try {
    body = (await request.json()) as AssetBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, cost, purchaseDate, usefulLifeMonths, salvageValue, venueId } = body;

  const cleanName = str(name, 120);
  if (!cleanName) {
    return NextResponse.json({ error: "Name is required (max 120 characters)" }, { status: 400 });
  }
  const cleanCost = money(cost, 1, 50_000_000);
  if (cleanCost === null) {
    return NextResponse.json({ error: "Cost must be from 1 to 50,000,000" }, { status: 400 });
  }
  if (!isIsoDate(purchaseDate)) {
    return NextResponse.json({ error: "A valid purchase date is required" }, { status: 400 });
  }
  if (int(usefulLifeMonths, 1, 600) === null) {
    return NextResponse.json({ error: "Useful life must be a whole number of months from 1 to 600" }, { status: 400 });
  }
  const salvage = money(salvageValue ?? 0, 0, 50_000_000);
  if (salvage === null) {
    return NextResponse.json({ error: "Salvage value must be an amount from 0 to 50,000,000" }, { status: 400 });
  }
  if (salvage >= cleanCost) {
    return NextResponse.json({ error: "Salvage value must be less than the cost" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("assets")
    .insert({
      name: cleanName,
      cost: cleanCost,
      purchase_date: purchaseDate,
      useful_life_months: usefulLifeMonths,
      salvage_value: salvage,
      venue_id: venueId || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return error ? dbError(error) : fail(500, "Something went wrong. Try again.", "write returned no row");
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
