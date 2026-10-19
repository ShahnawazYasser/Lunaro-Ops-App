import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  );
}

// Server-only Supabase client — uses the service role key, bypasses RLS.
// NEVER import this from any client component or expose it to the browser.
// Use only inside API routes (app/api/**) or server actions.
export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Service-role client that tells the database who is acting. Use it for every
// write to shift_entries so the audit trigger (migration_entry_audit.sql) can
// record actor_id. The id travels as an `x-actor-id` request header, which
// PostgREST exposes to Postgres as `request.headers`.
//
// Why a header and not set_config(): each supabase-js call is its own
// PostgREST request and its own transaction, so a transaction-local
// set_config('app.actor_id', ..., true) made in a separate call is gone
// before the write runs. A header rides on the write request itself.
export function supabaseAsActor(userId: string) {
  return createClient<Database>(supabaseUrl as string, serviceRoleKey as string, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { headers: { "x-actor-id": userId } },
  });
}
