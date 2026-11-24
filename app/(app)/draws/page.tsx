import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import DrawsClient from "./DrawsClient";

export default async function DrawsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  return <DrawsClient />;
}
