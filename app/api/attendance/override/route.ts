import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

interface OverrideBody {
  userId: string;
  date: string;       // YYYY-MM-DD
  setPresent: boolean; // the desired new state
}

// POST /api/attendance/override
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: OverrideBody;
  try {
    body = (await request.json()) as OverrideBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userId, date, setPresent } = body;

  if (!userId || !date || typeof setPresent !== "boolean") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Verify the target user is an employee
  const { data: targetUser } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (!targetUser || targetUser.role !== "employee") {
    return NextResponse.json({ error: "Target user not found or not an employee" }, { status: 400 });
  }

  // Check if an override row already exists
  const { data: existing } = await supabaseAdmin
    .from("attendance_overrides")
    .select("id")
    .eq("user_id", userId)
    .eq("override_date", date)
    .maybeSingle();

  if (existing) {
    const { error } = await supabaseAdmin
      .from("attendance_overrides")
      .update({ is_present: setPresent })
      .eq("id", existing.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabaseAdmin
      .from("attendance_overrides")
      .insert({
        user_id: userId,
        override_date: date,
        is_present: setPresent,
        created_by: session.userId,
      });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, date, isPresent: setPresent });
}
