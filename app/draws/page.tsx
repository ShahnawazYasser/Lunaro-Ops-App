import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import DrawsClient from "./DrawsClient";

export default async function DrawsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  const venueRes = await supabaseAdmin.from("venues").select("id, name").order("name");

  return (
    <DrawsClient
      user={{ id: session.userId, name: session.name, role: session.role }}
      venues={venueRes.data ?? []}
    />
  );
}
