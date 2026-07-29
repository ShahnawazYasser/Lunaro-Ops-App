import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createSessionToken, sessionCookieConfig } from "@/lib/session";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>)["name"] !== "string" ||
    typeof (body as Record<string, unknown>)["pin"] !== "string"
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { name, pin } = body as { name: string; pin: string };

  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid PIN format" }, { status: 400 });
  }

  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count: recentFailures, error: attemptsError } = await supabaseAdmin
    .from("login_attempts")
    .select("*", { count: "exact", head: true })
    .eq("name", name)
    .gte("attempted_at", fifteenMinutesAgo);

  if (attemptsError) {
    return NextResponse.json({ error: attemptsError.message }, { status: 500 });
  }

  if ((recentFailures ?? 0) >= 5) {
    return NextResponse.json(
      { error: "Too many attempts. Wait 15 minutes and try again." },
      { status: 429 }
    );
  }

  const { data: user, error } = await supabaseAdmin
    .from("users")
    .select("id, name, role, pin_hash")
    .eq("name", name)
    .maybeSingle();

  if (error || !user) {
    await supabaseAdmin.from("login_attempts").insert({ name });
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const pinMatch = await bcrypt.compare(pin, user.pin_hash);
  if (!pinMatch) {
    await supabaseAdmin.from("login_attempts").insert({ name });
    return NextResponse.json({ error: "Incorrect PIN" }, { status: 401 });
  }

  await supabaseAdmin.from("login_attempts").delete().eq("name", name);

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
