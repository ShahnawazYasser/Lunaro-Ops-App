import { resolveShiftCategory } from "@/lib/categories";
import { hoursWorked } from "@/lib/dates";
import { int, isIsoDate, isTime, money, str } from "@/lib/validate";

// Shared body validation for POST /api/entries and PUT /api/entries/[id].
// Pure — checks shape and bounds only. Rules that need the database
// (does the venue exist?) or the caller's role (date window) stay in the routes.

export interface ParsedExpense {
  description: string;
  amount: number;
  category: string;
}

export interface ParsedEntry {
  entryDate: string;
  clockIn: string | null;
  clockOut: string | null;
  venueId: string;
  eventName: string | null;
  totalPrints: number;
  extraPrints: number;
  systemPrints500: number;
  systemPrints250: number;
  freePrints: number;
  wastePrints: number;
  priceCharged: number | null;
  cashReceived: number;
  bankReceived: number;
  notes: string | null;
  expenses: ParsedExpense[];
  // Only meaningful for PUT, where it is checked against the stored row.
  userId: string | undefined;
}

export type ParseResult = { ok: true; value: ParsedEntry } | { ok: false; error: string };

const MAX_PRINTS = 2000;
const MAX_CASH = 2_000_000;
const MAX_EXPENSES = 20;

function bad(error: string): ParseResult {
  return { ok: false, error };
}

export function parseEntryBody(raw: unknown): ParseResult {
  if (typeof raw !== "object" || raw === null) return bad("Invalid request body");
  const b = raw as Record<string, unknown>;

  if (!isIsoDate(b.entryDate)) return bad("Enter a valid date.");
  if (typeof b.venueId !== "string" || b.venueId === "") return bad("Pick a venue.");

  const clockIn = b.clockIn === null || b.clockIn === undefined || b.clockIn === "" ? null : b.clockIn;
  const clockOut = b.clockOut === null || b.clockOut === undefined || b.clockOut === "" ? null : b.clockOut;
  if (clockIn !== null && !isTime(clockIn)) return bad("Start time isn't a valid time.");
  if (clockOut !== null && !isTime(clockOut)) return bad("End time isn't a valid time.");

  if (clockIn !== null && clockOut !== null && !hoursWorked(clockIn, clockOut)) {
    return bad("Check the times.");
  }

  const eventName =
    b.eventName === null || b.eventName === undefined ? null : str(b.eventName, 120);
  if (b.eventName !== null && b.eventName !== undefined && eventName === null) {
    return bad("Event name is too long (max 120 characters).");
  }
  if (b.venueId === "event" && !eventName) return bad("Event name is required");

  const counts = {
    totalPrints: int(b.totalPrints, 0, MAX_PRINTS),
    extraPrints: int(b.extraPrints, 0, MAX_PRINTS),
    systemPrints500: int(b.systemPrints500, 0, MAX_PRINTS),
    systemPrints250: int(b.systemPrints250, 0, MAX_PRINTS),
    freePrints: int(b.freePrints, 0, MAX_PRINTS),
    wastePrints: int(b.wastePrints, 0, MAX_PRINTS),
  };
  const countLabels: Record<keyof typeof counts, string> = {
    totalPrints: "Total prints",
    extraPrints: "Extra prints",
    systemPrints500: "Prints at PKR 500 (outside the booth app)",
    systemPrints250: "Prints at PKR 250 (outside the booth app)",
    freePrints: "Free prints",
    wastePrints: "Wasted prints",
  };
  for (const key of Object.keys(counts) as (keyof typeof counts)[]) {
    if (counts[key] === null) return bad(`${countLabels[key]} must be a whole number from 0 to ${MAX_PRINTS}.`);
  }

  const cashReceived = money(b.cashReceived, 0, MAX_CASH);
  if (cashReceived === null) return bad("Cash received must be an amount from 0 to 2,000,000.");
  const bankReceived = money(b.bankReceived, 0, MAX_CASH);
  if (bankReceived === null) return bad("Bank received must be an amount from 0 to 2,000,000.");

  let priceCharged: number | null = null;
  if (b.priceCharged !== null && b.priceCharged !== undefined) {
    priceCharged = money(b.priceCharged, 1, 100_000);
    if (priceCharged === null) return bad("Price offered must be an amount from 1 to 100,000.");
  }

  // Notes: optional, up to 300 characters; blank becomes null.
  const notes = b.notes === null || b.notes === undefined ? "" : str(b.notes, 300);
  if (notes === null) return bad("Notes are too long (max 300 characters).");

  // Missing or non-array expenses mean "none", not an error.
  const rawExpenses: unknown[] = Array.isArray(b.expenses) ? b.expenses : [];
  if (rawExpenses.length > MAX_EXPENSES) return bad(`You can add at most ${MAX_EXPENSES} expenses.`);

  const expenses: ParsedExpense[] = [];
  for (const item of rawExpenses) {
    const e = typeof item === "object" && item !== null ? (item as Record<string, unknown>) : {};
    const description = str(e.description, 200);
    if (description === null) return bad("An expense description is too long (max 200 characters).");
    // Rows left blank in the form are dropped, as before.
    if (description === "") continue;
    const amount = money(e.amount, 1, 500_000);
    if (amount === null) return bad("Each expense amount must be from 1 to 500,000.");
    const category = resolveShiftCategory(typeof e.category === "string" ? e.category : undefined);
    if (category === null) return bad("Pick a valid type for each expense.");
    expenses.push({ description, amount, category });
  }

  return {
    ok: true,
    value: {
      entryDate: b.entryDate,
      clockIn,
      clockOut,
      venueId: b.venueId,
      eventName,
      totalPrints: counts.totalPrints as number,
      extraPrints: counts.extraPrints as number,
      systemPrints500: counts.systemPrints500 as number,
      systemPrints250: counts.systemPrints250 as number,
      freePrints: counts.freePrints as number,
      wastePrints: counts.wastePrints as number,
      priceCharged,
      cashReceived,
      bankReceived,
      notes: notes || null,
      expenses,
      userId: typeof b.userId === "string" ? b.userId : undefined,
    },
  };
}

// snake_case shift_entries fields for the save_shift_entry RPC (everything
// except identity — callers add user_id / entry_date / last_edited_* as needed).
export function entryRecord(v: ParsedEntry) {
  return {
    venue_id: v.venueId,
    event_name: v.venueId === "event" ? v.eventName : null,
    clock_in: v.clockIn,
    clock_out: v.clockOut,
    total_prints: v.totalPrints,
    extra_prints: v.extraPrints,
    system_prints_500: v.systemPrints500,
    system_prints_250: v.systemPrints250,
    free_prints: v.freePrints,
    waste_prints: v.wastePrints,
    price_charged: v.priceCharged,
    cash_received: v.cashReceived,
    bank_received: v.bankReceived,
    notes: v.notes,
  };
}
