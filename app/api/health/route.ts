import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

// GET /api/health
// Verifies Supabase connectivity. Returns venue list as a connectivity probe.
// Remove or restrict this before going to production if you prefer.
export async function GET() {
  const { data, error } = await supabaseAdmin.from("venues").select("id, name");

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, venues: data });
}
