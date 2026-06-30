import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  );
}

// Browser/client-side Supabase client — uses the anon/publishable key.
// RLS restricts what this can touch: only venues is publicly readable.
// All writes and sensitive reads go through server API routes.
export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
