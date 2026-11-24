import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { getPayouts } from "@/lib/data/payouts";
import { supabaseAdmin } from "@/lib/supabase/server";
import PayoutsClient from "./PayoutsClient";

export const preferredRegion = "sin1";

export default async function PayoutsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  const [venueRes, initial] = await Promise.all([
    supabaseAdmin.from("venues").select("id, name").order("name"),
    getPayouts(),
  ]);

  return <PayoutsClient venues={venueRes.data ?? []} initial={initial} />;
}
