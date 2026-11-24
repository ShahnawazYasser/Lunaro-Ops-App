import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import LoginClient from "./LoginClient";

export default async function LoginPage() {
  // Checked against the database: a stale cookie (deactivated user, revoked
  // session) must show the login screen, not bounce back into the app.
  const session = await getVerifiedSession();
  if (session) {
    if (session.mustSetPin) redirect("/set-pin");
    redirect(session.role === "owner" ? "/dashboard" : "/entry");
  }

  // Active people only, employees A–Z first and the owner last. Names only —
  // nothing else about a user ever reaches this public page.
  const { data } = await supabaseAdmin.from("users").select("name, role").eq("active", true).order("name");
  const names = [...(data ?? [])]
    .sort((a, b) => Number(a.role === "owner") - Number(b.role === "owner"))
    .map((u) => u.name);

  return <LoginClient names={names} />;
}
