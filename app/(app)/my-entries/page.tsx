import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { currentMonthInKarachi } from "@/lib/dates";
import { getMyEntries } from "@/lib/data/entries";
import { supabaseAdmin } from "@/lib/supabase/server";
import MyEntriesClient from "./MyEntriesClient";

export const preferredRegion = "sin1";

export default async function MyEntriesPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");

  const month = currentMonthInKarachi();
  const [venueRes, initial] = await Promise.all([
    // Same venue list as /entry: active, and never a payout venue (Lanes).
    supabaseAdmin
      .from("venues")
      .select("id, name")
      .eq("active", true)
      .eq("collects_payments", false)
      .order("name"),
    getMyEntries(session.userId, month),
  ]);

  return (
    <MyEntriesClient
      user={{ id: session.userId, name: session.name, role: session.role }}
      venues={venueRes.data ?? []}
      initialMonth={month}
      initial={initial}
    />
  );
}
