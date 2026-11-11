import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import RecurringClient from "./RecurringClient";

export default async function RecurringPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  const venueRes = await supabaseAdmin.from("venues").select("id, name").order("name");

  return (
    <RecurringClient
      user={{ id: session.userId, name: session.name, role: session.role }}
      venues={venueRes.data ?? []}
    />
  );
}
