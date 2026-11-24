import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import AttendanceClient from "./AttendanceClient";

export default async function AttendancePage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  return <AttendanceClient />;
}
