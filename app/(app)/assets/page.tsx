import { redirect } from "next/navigation";
import { getVerifiedSession } from "@/lib/auth";
import { getAssets } from "@/lib/data/assets";
import { supabaseAdmin } from "@/lib/supabase/server";
import AssetsClient from "./AssetsClient";

export const preferredRegion = "sin1";

export default async function AssetsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect("/login");
  if (session.role !== "owner") redirect("/entry");

  const [venueRes, initial] = await Promise.all([
    supabaseAdmin.from("venues").select("id, name").order("name"),
    getAssets(),
  ]);

  return <AssetsClient venues={venueRes.data ?? []} initial={initial} />;
}
