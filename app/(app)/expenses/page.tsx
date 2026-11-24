import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { currentMonthInKarachi } from "@/lib/dates";
import { getExpenses } from "@/lib/data/expenses";
import { supabaseAdmin } from "@/lib/supabase/server";
import ExpensesClient from "./ExpensesClient";

export const preferredRegion = "sin1";

export default async function ExpensesPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  const month = currentMonthInKarachi();
  const [venueRes, employeeRes, initial] = await Promise.all([
    supabaseAdmin.from("venues").select("id, name").order("name"),
    // Pickers (who paid, salary for): active staff only. Past rows keep showing
    // their person via the API join, active or not.
    supabaseAdmin.from("users").select("id, name").eq("role", "employee").eq("active", true).order("name"),
    getExpenses(session, month, { paidBy: "all", userId: "all" }),
  ]);

  return (
    <ExpensesClient
      venues={venueRes.data ?? []}
      employees={employeeRes.data ?? []}
      initialMonth={month}
      initial={initial}
    />
  );
}
