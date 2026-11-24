import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  return <DashboardClient />;
}
