import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import ExpensesClient from "./ExpensesClient";

export default async function ExpensesPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  const [venueRes, employeeRes] = await Promise.all([
    supabaseAdmin.from("venues").select("id, name").order("name"),
    // Pickers (who paid, salary for): active staff only. Past rows keep showing
    // their person via the API join, active or not.
    supabaseAdmin.from("users").select("id, name").eq("role", "employee").eq("active", true).order("name"),
  ]);

  return (
    <ExpensesClient
      user={{ id: session.userId, name: session.name, role: session.role }}
      venues={venueRes.data ?? []}
      employees={employeeRes.data ?? []}
    />
  );
}
