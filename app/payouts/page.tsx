import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import PayoutsClient from "./PayoutsClient";

export default async function PayoutsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  const venueRes = await supabaseAdmin.from("venues").select("id, name").order("name");

  return (
    <PayoutsClient
      user={{ id: session.userId, name: session.name, role: session.role }}
      venues={venueRes.data ?? []}
    />
  );
}
