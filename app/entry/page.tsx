import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import EntryClient from "./EntryClient";

export default async function EntryPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { data: venues } = await supabaseAdmin
    .from("venues")
    .select("id, name")
    .order("name");

  return (
    <EntryClient
      user={{ id: session.userId, name: session.name, role: session.role }}
      venues={venues ?? []}
    />
  );
}
