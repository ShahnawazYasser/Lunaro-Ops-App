import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import EntriesClient from "./EntriesClient";

export default async function EntriesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  const { data: venues } = await supabaseAdmin
    .from("venues")
    .select("id, name")
    .order("name");

  return <EntriesClient venues={venues ?? []} />;
}
