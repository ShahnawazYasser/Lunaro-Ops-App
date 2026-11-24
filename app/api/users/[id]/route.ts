import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError, fail } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hashPin, isWeakPin } from "@/lib/pin";
import { isUuid } from "@/lib/validate";

export const preferredRegion = "sin1";

// PATCH /api/users/[id] — owner-only. One action per call:
//   { action: "reset_pin", pin }   new temporary PIN; they must choose their own
//   { action: "deactivate" }       can't sign in; history stays. Never deleted.
//   { action: "reactivate" }
// Anything that ends sessions bumps session_version. No response contains pin_hash.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (!isUuid(id)) return fail(404, "User not found");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid request body");
  }
  const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const action = b["action"];

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, name, role, active, session_version")
    .eq("id", id)
    .maybeSingle();
  if (error) return dbError(error);
  if (!user) return fail(404, "User not found");

  if (action === "reset_pin") {
    const pin = b["pin"];
    if (typeof pin !== "string") return fail(400, "Enter a temporary PIN.");
    const weak = isWeakPin(pin);
    if (weak) return fail(400, weak);

    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        pin_hash: await hashPin(pin),
        must_set_pin: true,
        pin_changed_at: null,
        session_version: user.session_version + 1,
      })
      .eq("id", id);
    if (updateError) return dbError(updateError);

    // A reset also lifts any lockout on that name.
    const { error: clearError } = await supabaseAdmin.from("login_attempts").delete().eq("name", user.name);
    if (clearError) console.error("users: could not clear login attempts", clearError);
    return NextResponse.json({ ok: true, signedOutSelf: id === session.userId });
  }

  if (action === "deactivate") {
    if (id === session.userId) return fail(400, "You can't deactivate yourself.");
    if (!user.active) return NextResponse.json({ ok: true });
    if (user.role === "owner") {
      const { count, error: countError } = await supabaseAdmin
        .from("users")
        .select("*", { count: "exact", head: true })
        .eq("role", "owner")
        .eq("active", true);
      if (countError) return dbError(countError);
      if ((count ?? 0) <= 1) return fail(400, "There must be at least one active owner.");
    }
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({ active: false, session_version: user.session_version + 1 })
      .eq("id", id);
    if (updateError) return dbError(updateError);
    return NextResponse.json({ ok: true });
  }

  if (action === "reactivate") {
    const { error: updateError } = await supabaseAdmin.from("users").update({ active: true }).eq("id", id);
    if (updateError) return dbError(updateError);
    return NextResponse.json({ ok: true });
  }

  return fail(400, "Unknown action");
}
