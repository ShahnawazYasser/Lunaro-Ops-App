import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { currentMonthInKarachi } from "@/lib/dates";
import { getEntries } from "@/lib/data/entries";
import { supabaseAdmin } from "@/lib/supabase/server";
import EntriesClient from "./EntriesClient";

export const preferredRegion = "sin1";

export default async function EntriesPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  const month = currentMonthInKarachi();
  const [venueRes, initial] = await Promise.all([
    supabaseAdmin.from("venues").select("id, name").order("name"),
    getEntries(month),
  ]);

  return <EntriesClient venues={venueRes.data ?? []} initialMonth={month} initial={initial} />;
}
