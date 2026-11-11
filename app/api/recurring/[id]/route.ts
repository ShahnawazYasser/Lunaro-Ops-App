import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";
import { isCategory } from "@/lib/categories";
import type { Database } from "@/lib/supabase/types";

export const preferredRegion = "sin1";

type RecurringUpdate = Database["public"]["Tables"]["recurring_expenses"]["Update"];

interface PatchBody {
  name?: string;
  category?: string;
  amount?: number;
  dueDay?: number;
  venueId?: string | null;
  active?: boolean;
}

// ── PATCH /api/recurring/[id] ─────────────────────────────────────────────
// Owner-only. Partial update: edit any field, or flip `active` to pause /
// resume a cost (an inactive one stops feeding the dashboard rent warning).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const update: RecurringUpdate = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    update.name = body.name.trim();
  }
  if (body.category !== undefined) {
    if (!isCategory(body.category)) {
      return NextResponse.json({ error: "Pick a valid category" }, { status: 400 });
    }
    update.category = body.category;
  }
  if (body.amount !== undefined) {
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0) {
      return NextResponse.json({ error: "Amount must be greater than 0" }, { status: 400 });
    }
    update.amount = body.amount;
  }
  if (body.dueDay !== undefined) {
    if (!Number.isInteger(body.dueDay) || body.dueDay < 1 || body.dueDay > 28) {
      return NextResponse.json({ error: "Day of month must be between 1 and 28" }, { status: 400 });
    }
    update.due_day = body.dueDay;
  }
  if (body.venueId !== undefined) update.venue_id = body.venueId || null;
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return NextResponse.json({ error: "active must be true or false" }, { status: 400 });
    }
    update.active = body.active;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("recurring_expenses")
    .update(update)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Recurring cost not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id });
}

// ── DELETE /api/recurring/[id] ────────────────────────────────────────────
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("recurring_expenses")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Recurring cost not found" }, { status: 404 });
  return NextResponse.json({ ok: true, id });
}
