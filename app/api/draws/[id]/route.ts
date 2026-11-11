import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

// ── DELETE /api/draws/[id] ────────────────────────────────────────────────
// Owner-only. Only ever deletes rows flagged is_owner_draw — it can't be
// used to delete a normal business expense by id.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("expenses")
    .select("id")
    .eq("id", id)
    .eq("is_owner_draw", true)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Draw not found" }, { status: 404 });

  const { error } = await supabaseAdmin.from("expenses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id });
}
