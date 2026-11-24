import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { getBookings } from "@/lib/data/bookings";
import BookingsClient from "./BookingsClient";

export const preferredRegion = "sin1";

export default async function BookingsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  return <BookingsClient initial={await getBookings("upcoming")} />;
}
