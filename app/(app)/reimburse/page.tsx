import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { currentMonthInKarachi } from "@/lib/dates";
import { getExpenses } from "@/lib/data/expenses";
import { supabaseAdmin } from "@/lib/supabase/server";
import ReimburseClient from "./ReimburseClient";

export const preferredRegion = "sin1";

export default async function ReimbursePage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");

  const month = currentMonthInKarachi();
  const [venueRes, initial] = await Promise.all([
    supabaseAdmin.from("venues").select("id, name").order("name"),
    // Employees only ever get their own employee-paid rows (enforced in getExpenses).
    getExpenses(session, month, { paidBy: "employee", userId: session.userId }),
  ]);

  return (
    <ReimburseClient
      user={{ id: session.userId, name: session.name, role: session.role }}
      venues={venueRes.data ?? []}
      initialMonth={month}
      initial={initial}
    />
  );
}
