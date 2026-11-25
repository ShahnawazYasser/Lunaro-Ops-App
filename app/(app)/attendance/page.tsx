import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { currentMonthInKarachi } from "@/lib/dates";
import { getAttendance } from "@/lib/data/attendance";
import AttendanceClient from "./AttendanceClient";

export const preferredRegion = "sin1";

export default async function AttendancePage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  const month = currentMonthInKarachi();
  return <AttendanceClient initialMonth={month} initial={await getAttendance(month)} />;
}
