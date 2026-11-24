import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dbError, fail } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";
import { hashPin, isWeakPin } from "@/lib/pin";
import { str } from "@/lib/validate";

export const preferredRegion = "sin1";

// Owner-only. NEVER select or return pin_hash from this file.
const SELECT = "id, name, role, active, must_set_pin, pin_changed_at, created_at";

// ── GET /api/users ─────────────────────────────────────────────────────────
export async function GET() {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { data, error } = await supabaseAdmin
    .from("users")
    .select(SELECT)
    .order("active", { ascending: false })
    .order("name");

  if (error) return dbError(error);
  // Employees first, owner last — same order as the login screen.
  const items = [...(data ?? [])].sort((a, b) => Number(a.role === "owner") - Number(b.role === "owner"));
  return NextResponse.json({ items });
}

// ── POST /api/users — add a staff member with a temporary PIN ──────────────
export async function POST(request: NextRequest) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Invalid request body");
  }
  const b = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};

  const name = str(b["name"], 30);
  if (!name || name.length < 2) return fail(400, "Name must be 2 to 30 characters.");
  const pin = b["pin"];
  if (typeof pin !== "string") return fail(400, "Enter a temporary PIN.");
  const weak = isWeakPin(pin);
  if (weak) return fail(400, weak);

  // Names are how people sign in, so they must be unique ignoring case.
  const { data: clash, error: clashError } = await supabaseAdmin
    .from("users")
    .select("id")
    .ilike("name", name.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (clashError) return dbError(clashError);
  if (clash) return fail(409, "Someone with that name already exists.");

  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({ name, role: "employee", pin_hash: await hashPin(pin), must_set_pin: true })
    .select("id")
    .single();

  if (error || !data) {
    return error ? dbError(error) : fail(500, "Something went wrong. Try again.", "user insert returned no row");
  }
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}
