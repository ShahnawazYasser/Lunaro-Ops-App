import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import UsersClient from "./UsersClient";

export default async function UsersPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  return <UsersClient user={{ id: session.userId, name: session.name, role: session.role }} />;
}
