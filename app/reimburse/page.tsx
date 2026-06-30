import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import ReimburseClient from "./ReimburseClient";

export default async function ReimbursePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [venueRes, employeeRes] = await Promise.all([
    supabaseAdmin.from("venues").select("id, name").order("name"),
    supabaseAdmin.from("users").select("id, name").eq("role", "employee").order("name"),
  ]);

  return (
    <ReimburseClient
      user={{ id: session.userId, name: session.name, role: session.role }}
      venues={venueRes.data ?? []}
      employees={employeeRes.data ?? []}
    />
  );
}
