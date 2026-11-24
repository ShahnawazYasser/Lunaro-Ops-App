import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import EntryClient from "./EntryClient";

export default async function EntryPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");

  const { data: venues } = await supabaseAdmin
    .from("venues")
    .select("id, name")
    .eq("active", true)
    .eq("collects_payments", false) // staff never log at payout venues (Lanes)
    .order("name");

  return (
    <EntryClient
      user={{ id: session.userId, name: session.name, role: session.role }}
      venues={venues ?? []}
    />
  );
}
