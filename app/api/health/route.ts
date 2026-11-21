import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

// GET /api/health — connectivity probe. Returns only ok true/false.
export async function GET() {
  const { error } = await supabaseAdmin.from("venues").select("id").limit(1);

  if (error) {
    console.error("health: supabase probe failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
