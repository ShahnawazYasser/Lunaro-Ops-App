import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

// Assets + straight-line depreciation (Chunk 2). Owner-only, every method.
// Monthly depreciation is never stored here — it's computed live by the
// asset_depreciation view (see migration_finance_v2.sql).
const SELECT = `
  id, name, cost, purchase_date, useful_life_months, salvage_value, venue_id, created_at,
  venues(name)
`;

// ── GET /api/assets ─────────────────────────────────────────────────────────
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabaseAdmin
    .from("assets")
    .select(SELECT)
    .order("purchase_date", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assets: data ?? [] });
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
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: AssetBody;
  try {
    body = (await request.json()) as AssetBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, cost, purchaseDate, usefulLifeMonths, salvageValue, venueId } = body;

  if (!name || !name.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost <= 0) {
    return NextResponse.json({ error: "Cost must be greater than 0" }, { status: 400 });
  }
  if (!purchaseDate || !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
    return NextResponse.json({ error: "A valid purchase date is required" }, { status: 400 });
  }
  if (typeof usefulLifeMonths !== "number" || !Number.isInteger(usefulLifeMonths) || usefulLifeMonths <= 0) {
    return NextResponse.json({ error: "Useful life must be a whole number of months greater than 0" }, { status: 400 });
  }
  const salvage = salvageValue ?? 0;
  if (typeof salvage !== "number" || !Number.isFinite(salvage) || salvage < 0) {
    return NextResponse.json({ error: "Salvage value can't be negative" }, { status: 400 });
  }
  if (salvage >= cost) {
    return NextResponse.json({ error: "Salvage value must be less than the cost" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("assets")
    .insert({
      name: name.trim(),
      cost,
      purchase_date: purchaseDate,
      useful_life_months: usefulLifeMonths,
      salvage_value: salvage,
      venue_id: venueId || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
