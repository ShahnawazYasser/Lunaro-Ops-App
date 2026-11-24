import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import MyEntriesClient from "./MyEntriesClient";

export default async function MyEntriesPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");

  // Same venue list as /entry: active, and never a payout venue (Lanes).
  const { data: venues } = await supabaseAdmin
    .from("venues")
    .select("id, name")
    .eq("active", true)
    .eq("collects_payments", false)
    .order("name");

  return (
    <MyEntriesClient
      user={{ id: session.userId, name: session.name, role: session.role }}
      venues={venues ?? []}
    />
  );
}
