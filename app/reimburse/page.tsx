import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import ReimburseClient from "./ReimburseClient";

export default async function ReimbursePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const { data: venues } = await supabaseAdmin.from("venues").select("id, name").order("name");

  return (
    <ReimburseClient
      user={{ id: session.userId, name: session.name, role: session.role }}
      venues={venues ?? []}
    />
  );
}
