import { getSession, type SessionUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

// The one place a session cookie is checked against the database.
//
// A signed token alone is not enough: the user may have been deactivated, or
// had their PIN changed/reset (which bumps session_version). So every API
// request and every server page does one indexed single-row lookup. Role and
// name come from the database row, never from the token.
//
// Returns null when there is no cookie, the user is missing or inactive, or
// the token's version is out of date. `mustSetPin` is the database's value.
export async function getVerifiedSession(): Promise<SessionUser | null> {
  const token = await getSession();
  if (!token) return null;

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, name, role, active, session_version, must_set_pin")
    .eq("id", token.userId)
    .maybeSingle();

  if (error) {
    console.error("session check failed", error);
    return null;
  }
  if (!data || !data.active || data.session_version !== token.sv) return null;
  if (data.role !== "employee" && data.role !== "owner") return null;

  return {
    userId: data.id,
    name: data.name,
    role: data.role,
    sv: data.session_version,
    mustSetPin: data.must_set_pin,
  };
}
