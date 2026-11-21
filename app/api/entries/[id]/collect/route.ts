import { NextRequest, NextResponse } from "next/server";
import { requireOwner, fail, dbError } from "@/lib/api";
import { supabaseAsActor } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

interface CollectBody {
  collected: boolean;
}

// PATCH /api/entries/[id]/collect — owner-only, flips the cash_collected flag
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  let body: CollectBody;
  try {
    body = (await request.json()) as CollectBody;
  } catch {
    return fail(400, "Invalid request body");
  }

  if (typeof body !== "object" || body === null || typeof body.collected !== "boolean") {
    return fail(400, "collected must be a boolean");
  }

  const { error } = await supabaseAsActor(session.userId)
    .from("shift_entries")
    .update({
      cash_collected: body.collected,
      cash_collected_at: body.collected ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return dbError(error);

  return NextResponse.json({ ok: true });
}
