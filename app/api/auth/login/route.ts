import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { fail } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createSessionToken, sessionCookieConfig } from "@/lib/session";

export const preferredRegion = "sin1";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_NAME_IP = 5;
const MAX_PER_NAME = 20;

// Valid bcrypt (cost 12) hash of a throwaway string. Compared against when
// the name doesn't exist so response time doesn't reveal which names are real.
const DUMMY_HASH = "$2b$12$w6aioB2CGcbYZCukCz1t..T37RRpTIyYk8Ixd/iLh6ueKmzrj6ccu";

const SERVER_ERROR = "Something went wrong. Try again.";

function wrongCredentials(): NextResponse {
  return NextResponse.json({ error: "Wrong name or PIN" }, { status: 401 });
}

function clientIp(request: NextRequest): string {
  const first = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid request body");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>)["name"] !== "string" ||
    typeof (body as Record<string, unknown>)["pin"] !== "string"
  ) {
    return fail(400, "Invalid request");
  }

  const { name, pin } = body as { name: string; pin: string };

  if (!/^\d{4,8}$/.test(pin)) {
    return fail(400, "Invalid PIN format");
  }

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, name, role, pin_hash")
    .eq("name", name)
    .maybeSingle();

  if (error) return fail(500, SERVER_ERROR, error);

  if (!user) {
    // Same cost and same response as a wrong PIN; no login_attempts row
    // (unknown names must not grow the table).
    await bcrypt.compare(pin, DUMMY_HASH);
    return wrongCredentials();
  }

  const ip = clientIp(request);
  const since = new Date(Date.now() - WINDOW_MS).toISOString();

  const [perNameIp, perName] = await Promise.all([
    supabaseAdmin
      .from("login_attempts")
      .select("*", { count: "exact", head: true })
      .eq("name", user.name)
      .eq("ip", ip)
      .gte("attempted_at", since),
    supabaseAdmin
      .from("login_attempts")
      .select("*", { count: "exact", head: true })
      .eq("name", user.name)
      .gte("attempted_at", since),
  ]);

  if (perNameIp.error || perName.error) {
    return fail(500, SERVER_ERROR, perNameIp.error ?? perName.error);
  }

  if ((perNameIp.count ?? 0) >= MAX_PER_NAME_IP || (perName.count ?? 0) >= MAX_PER_NAME) {
    return fail(429, "Too many attempts. Wait 15 minutes and try again.");
  }

  const pinMatch = await bcrypt.compare(pin, user.pin_hash);
  if (!pinMatch) {
    const { error: insertError } = await supabaseAdmin
      .from("login_attempts")
      .insert({ name: user.name, ip });
    if (insertError) console.error("login: could not record failed attempt", insertError);
    return wrongCredentials();
  }

  // Success: clear this name's attempts and sweep anything older than 24h.
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [clearName, sweep] = await Promise.all([
    supabaseAdmin.from("login_attempts").delete().eq("name", user.name),
    supabaseAdmin.from("login_attempts").delete().lt("attempted_at", dayAgo),
  ]);
  if (clearName.error || sweep.error) {
    console.error("login: housekeeping failed", clearName.error ?? sweep.error);
  }

  const token = await createSessionToken({
    userId: user.id,
    name: user.name,
    role: user.role as "employee" | "owner",
  });

  const response = NextResponse.json({
    user: { id: user.id, name: user.name, role: user.role },
  });

  response.cookies.set({
    ...sessionCookieConfig,
    value: token,
    secure: process.env.NODE_ENV === "production",
  });

  return response;
}
