import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

interface CollectBody {
  collected: boolean;
}

// PATCH /api/entries/[id]/collect — owner-only, flips the cash_collected flag
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: CollectBody;
  try {
    body = (await request.json()) as CollectBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body.collected !== "boolean") {
    return NextResponse.json({ error: "collected must be a boolean" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("shift_entries")
    .update({
      cash_collected: body.collected,
      cash_collected_at: body.collected ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
