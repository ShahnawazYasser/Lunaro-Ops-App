import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import AttendanceClient from "./AttendanceClient";

export default async function AttendancePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  return <AttendanceClient ownerId={session.userId} />;
}
