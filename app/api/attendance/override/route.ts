import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError } from "@/lib/api";
import { isIsoDate, isUuid } from "@/lib/validate";
import { todayInKarachi } from "@/lib/dates";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

interface OverrideBody {
  userId: string;
  date: string;       // YYYY-MM-DD
  setPresent: boolean; // the desired new state
}

// POST /api/attendance/override
export async function POST(request: NextRequest) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: OverrideBody;
  try {
    body = (await request.json()) as OverrideBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { userId, date, setPresent } = body;

  if (!isUuid(userId) || typeof setPresent !== "boolean") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!isIsoDate(date)) {
    return NextResponse.json({ error: "A valid date is required" }, { status: 400 });
  }
  if (date > todayInKarachi()) {
    return NextResponse.json({ error: "You can't mark attendance for a future date" }, { status: 400 });
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

    if (error) return dbError(error);
  } else {
    const { error } = await supabaseAdmin
      .from("attendance_overrides")
      .insert({
        user_id: userId,
        override_date: date,
        is_present: setPresent,
        created_by: session.userId,
      });

    if (error) return dbError(error);
  }

  return NextResponse.json({ ok: true, date, isPresent: setPresent });
}
