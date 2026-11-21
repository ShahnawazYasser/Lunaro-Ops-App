import { NextRequest, NextResponse } from "next/server";
import { requireOwner, requireSession, dbError } from "@/lib/api";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

// ── PATCH /api/expenses/[id] ──────────────────────────────────────────────
// Owner-only, single purpose: flip an employee-paid expense between
// 'pending' and 'paid'. Nothing else about the row is touched.
//
// Marking paid does NOT move the expense between months — it already counted
// in the month of its expense_date and stays there (accrual).
interface PatchBody {
  reimbursementStatus: "pending" | "paid";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const status = body.reimbursementStatus;
  if (status !== "pending" && status !== "paid") {
    return NextResponse.json({ error: "Status must be 'pending' or 'paid'" }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("expenses")
    .select("id, paid_by")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return dbError(fetchError);
  if (!existing) return NextResponse.json({ error: "Expense not found" }, { status: 404 });

  if (existing.paid_by !== "employee") {
    return NextResponse.json(
      { error: "This was paid by the company — there's nobody to pay back." },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("expenses")
    .update({ reimbursement_status: status })
    .eq("id", id);

  if (updateError) return dbError(updateError);

  return NextResponse.json({ ok: true, id, reimbursementStatus: status });
}

// ── DELETE /api/expenses/[id] ─────────────────────────────────────────────
// Employees: only their own employee-paid rows, and only while still
// pending — once the owner has paid it back, the record is history.
//
// Owner: anything EXCEPT shift-linked rows. Those belong to the shift entry
// form / owner entry-edit flow; deleting one here would silently change that
// shift's net behind the entries screen's back.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("expenses")
    .select("id, paid_by, payer_user_id, reimbursement_status, shift_entry_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) return dbError(fetchError);
  if (!existing) return NextResponse.json({ error: "Expense not found" }, { status: 404 });

  if (existing.shift_entry_id) {
    return NextResponse.json(
      {
        error:
          "This expense is part of a shift entry. Edit that shift entry to change or remove it.",
      },
      { status: 409 }
    );
  }

  if (session.role !== "owner") {
    if (existing.paid_by !== "employee" || existing.payer_user_id !== session.userId) {
      return NextResponse.json(
        { error: "You can only delete expenses you logged yourself." },
        { status: 403 }
      );
    }
    if (existing.reimbursement_status !== "pending") {
      return NextResponse.json(
        { error: "This has already been paid back, so it can't be deleted." },
        { status: 409 }
      );
    }
  }

  const { error: deleteError } = await supabaseAdmin.from("expenses").delete().eq("id", id);
  if (deleteError) return dbError(deleteError);

  return NextResponse.json({ ok: true, id });
}
