import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

// ── DELETE /api/assets/[id] ───────────────────────────────────────────────
// Owner-only. Deleting an asset also removes its future depreciation from
// asset_depreciation, since that view is always computed live from this
// table — there is nothing else to clean up.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("assets")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return dbError(fetchError);
  if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const { error: deleteError } = await supabaseAdmin.from("assets").delete().eq("id", id);
  if (deleteError) return dbError(deleteError);

  return NextResponse.json({ ok: true, id });
}
