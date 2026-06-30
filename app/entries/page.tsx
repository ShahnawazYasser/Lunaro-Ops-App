import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import EntriesClient from "./EntriesClient";

export default async function EntriesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  return <EntriesClient />;
}
