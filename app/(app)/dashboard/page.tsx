import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { currentMonthInKarachi } from "@/lib/dates";
import { getDashboard } from "@/lib/data/dashboard";
import DashboardClient from "./DashboardClient";

export const preferredRegion = "sin1";

export default async function DashboardPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  const month = currentMonthInKarachi();
  return <DashboardClient initialMonth={month} initial={await getDashboard(month)} />;
}
