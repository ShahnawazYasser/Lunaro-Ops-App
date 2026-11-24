import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import BookingsClient from "./BookingsClient";

export default async function BookingsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  return <BookingsClient user={{ id: session.userId, name: session.name, role: session.role }} />;
}
