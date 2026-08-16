import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import BookingsClient from "./BookingsClient";

export default async function BookingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  return <BookingsClient user={{ id: session.userId, name: session.name, role: session.role }} />;
}
