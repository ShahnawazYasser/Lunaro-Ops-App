import { NextRequest, NextResponse } from "next/server";
import { requireOwner, fail, dbError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validate";

export const preferredRegion = "sin1";

// GET /api/entries/[id]/audit — owner-only change history of one entry,
// newest first, with the name of whoever made each change. A null actor means
// the change bypassed the app (e.g. a direct database edit).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (!isUuid(id)) return fail(404, "Entry not found");

  const { data, error } = await supabaseAdmin
    .from("entry_audit")
    .select("id, action, changed, was_collected, created_at, actor:users!entry_audit_actor_id_fkey(name)")
    .eq("entry_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (error) return dbError(error);
  return NextResponse.json({ history: data ?? [] });
}
