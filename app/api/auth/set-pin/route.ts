import { NextRequest, NextResponse } from "next/server";
import { requireSession, fail, dbError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createSessionToken, sessionCookie } from "@/lib/session";
import { hashPin, verifyPin, isWeakPin } from "@/lib/pin";

export const preferredRegion = "sin1";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_WRONG_CURRENT = 5;

// POST /api/auth/set-pin  { pin, currentPin? }
// Acts ONLY on the signed-in user — it never accepts a user id. First-time
// setup (a temporary PIN set by the owner) doesn't ask for the current PIN; a
// voluntary change does. Bumps session_version, which signs out every other
// device, and reissues this device's cookie.
export async function POST(request: NextRequest) {
  const session = await requireSession({ allowMustSetPin: true });
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid request body");
  }
  const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const pin = b["pin"];
  const currentPin = b["currentPin"];
  if (typeof pin !== "string") return fail(400, "Enter a new PIN.");

  const weak = isWeakPin(pin);
  if (weak) return fail(400, weak);

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, name, role, pin_hash, must_set_pin, session_version")
    .eq("id", session.userId)
    .maybeSingle();
  if (error) return dbError(error);
  if (!user) return fail(401, "Unauthorized");

  if (!user.must_set_pin) {
    // Voluntary change: prove you know the current PIN, with the same lockout
    // as login so a borrowed phone can't be used to guess it.
    if (typeof currentPin !== "string" || !/^\d{4,8}$/.test(currentPin)) {
      return fail(400, "Enter your current PIN.");
    }
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count, error: countError } = await supabaseAdmin
      .from("login_attempts")
      .select("*", { count: "exact", head: true })
      .eq("name", user.name)
      .gte("attempted_at", since);
    if (countError) return dbError(countError);
    if ((count ?? 0) >= MAX_WRONG_CURRENT) {
      return fail(429, "Too many attempts. Wait 15 minutes and try again.");
    }
    if (!(await verifyPin(currentPin, user.pin_hash))) {
      const { error: insertError } = await supabaseAdmin.from("login_attempts").insert({ name: user.name, ip: "set-pin" });
      if (insertError) console.error("set-pin: could not record failed attempt", insertError);
      return fail(400, "Your current PIN isn't right.");
    }
  }

  if (await verifyPin(pin, user.pin_hash)) {
    return fail(400, "Choose a different PIN from the one you have now.");
  }

  const nextVersion = user.session_version + 1;
  const { data: updated, error: updateError } = await supabaseAdmin
    .from("users")
    .update({
      pin_hash: await hashPin(pin),
      must_set_pin: false,
      pin_changed_at: new Date().toISOString(),
      session_version: nextVersion,
    })
    .eq("id", user.id)
    .eq("session_version", user.session_version) // lose the race cleanly instead of overwriting
    .select("id")
    .maybeSingle();
  if (updateError) return dbError(updateError);
  if (!updated) return fail(409, "Your sign-in changed while you were doing this. Try again.");

  const role = user.role as "employee" | "owner";
  const token = await createSessionToken({
    userId: user.id,
    name: user.name,
    role,
    sv: nextVersion,
    mustSetPin: false,
  });

  const response = NextResponse.json({ ok: true, landing: role === "owner" ? "/dashboard" : "/entry" });
  response.cookies.set(sessionCookie(role, token));
  return response;
}
