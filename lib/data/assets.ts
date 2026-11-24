import { supabaseAdmin } from "@/lib/supabase/server";
import { check } from "./errors";

// Assets + straight-line depreciation. Monthly depreciation is never stored here —
// it is computed live by the asset_depreciation view (db/migration_finance_v2.sql).
const SELECT = `
  id, name, cost, purchase_date, useful_life_months, salvage_value, venue_id, created_at,
  venues(name)
`;

export async function getAssets() {
  const { data, error } = await supabaseAdmin
    .from("assets")
    .select(SELECT)
    .order("purchase_date", { ascending: false });
  check(error);
  return { assets: data ?? [] };
}
