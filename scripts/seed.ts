// One-time seed script — creates the three Lunaro Ops users with bcrypt-hashed PINs.
// Run with: npm run seed  (requires .env.local to be set up)
//       or: npx tsx scripts/seed.ts  (with env vars exported in shell)
//
// Safe to re-run: checks for existing rows before inserting.

import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import type { Database } from "../lib/supabase/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
  );
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SALT_ROUNDS = 12;

const USERS = [
  { name: "Ahsan",  role: "employee" as const, pin: "8776" },
  { name: "Farhan", role: "employee" as const, pin: "2537" },
  { name: "Owner",  role: "owner"    as const, pin: "1200" },
] as const;

async function seed(): Promise<void> {
  console.log("Seeding users...\n");

  for (const user of USERS) {
    const pin_hash = await bcrypt.hash(user.pin, SALT_ROUNDS);

    // Check if user already exists (users.name is unique)
    const { data: existing, error: selectError } = await supabase
      .from("users")
      .select("id")
      .eq("name", user.name)
      .maybeSingle();

    if (selectError) {
      console.error(`  ✗ ${user.name}: select failed — ${selectError.message}`);
      process.exit(1);
    }

    if (existing) {
      // Already exists — update the PIN hash only
      const { error: updateError } = await supabase
        .from("users")
        .update({ pin_hash })
        .eq("id", existing.id);

      if (updateError) {
        console.error(`  ✗ ${user.name}: update failed — ${updateError.message}`);
        process.exit(1);
      }

      console.log(`  ~ ${user.name} (${user.role}) — updated PIN hash`);
    } else {
      // New user — insert
      const { error: insertError } = await supabase
        .from("users")
        .insert({ name: user.name, role: user.role, pin_hash });

      if (insertError) {
        console.error(`  ✗ ${user.name}: insert failed — ${insertError.message}`);
        process.exit(1);
      }

      console.log(`  ✓ ${user.name} (${user.role}) — created`);
    }
  }

  console.log("\nDone.");
}

seed();
