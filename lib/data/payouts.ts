import { supabaseAdmin } from "@/lib/supabase/server";
import { check } from "./errors";

// payout_due is a manual date, never computed (db/migration_payout_due_manual.sql).
const SELECT = `
  id, venue_id, cycle_start, cycle_end, payout_due, gross_amount, rent_deducted,
  received_on, received_amount, venues(name)
`;

export async function getPayouts() {
  const { data, error } = await supabaseAdmin
    .from("payout_cycles")
    .select(SELECT)
    .order("cycle_start", { ascending: false });
  check(error);
  return { cycles: data ?? [] };
}
