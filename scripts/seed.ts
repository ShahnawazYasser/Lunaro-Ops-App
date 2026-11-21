// Seed script — creates or updates Lunaro Ops users with bcrypt-hashed PINs.
// Users come from the SEED_USERS env var (JSON) so no PIN ever lives in the repo.
//
// Run with:
//   SEED_USERS='[{"name":"Ahsan","role":"employee","pin":"...."}]' npm run seed
// or put SEED_USERS on one line in .env.local (see .env.local.example).
//
// Safe to re-run: updates the PIN hash of an existing name, inserts otherwise.

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

interface SeedUser {
  name: string;
  role: "employee" | "owner";
  pin: string;
}

const SEED_HELP =
  'SEED_USERS must be a JSON array like [{"name":"Ahsan","role":"employee","pin":"1234"}] ' +
  '(role: "employee" or "owner", pin: 4-8 digits).';

function parseSeedUsers(raw: string | undefined): SeedUser[] {
  if (!raw) {
    console.error(`SEED_USERS is not set. ${SEED_HELP}`);
    process.exit(1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`SEED_USERS is not valid JSON. ${SEED_HELP}`);
    process.exit(1);
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    console.error(`SEED_USERS must be a non-empty array. ${SEED_HELP}`);
    process.exit(1);
  }

  const users: SeedUser[] = [];
  parsed.forEach((item: unknown, i: number) => {
    const o = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : null;
    const name = o?.["name"];
    const role = o?.["role"];
    const pin = o?.["pin"];
    if (
      typeof name !== "string" ||
      name.trim() === "" ||
      (role !== "employee" && role !== "owner") ||
      typeof pin !== "string" ||
      !/^\d{4,8}$/.test(pin)
    ) {
      // Report the position only — never echo the entry, it contains a PIN.
      console.error(`SEED_USERS entry #${i + 1} is invalid. ${SEED_HELP}`);
      process.exit(1);
    }
    users.push({ name: name.trim(), role, pin });
  });
  return users;
}

const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SALT_ROUNDS = 12;

async function seed(): Promise<void> {
  const users = parseSeedUsers(process.env.SEED_USERS);
  console.log("Seeding users...\n");

  for (const user of users) {
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
