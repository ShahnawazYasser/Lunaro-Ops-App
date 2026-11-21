import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/server";

export const preferredRegion = "sin1";

const PUBLIC_MARKER = "/object/public/receipts/";

// Resolves what's stored in expenses.receipt_url to a storage path:
//   - new rows store the path itself ("<user-id>/<ts>.jpg")
//   - legacy rows store a full public URL on this project's storage host
// Anything else (another host, a malformed value) resolves to null.
function toStoragePath(stored: string): string | null {
  if (!/^https?:\/\//i.test(stored)) return stored;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  let url: URL;
  try {
    url = new URL(stored);
  } catch {
    return null;
  }
  if (url.host !== new URL(base).host) return null;

  const i = url.pathname.indexOf(PUBLIC_MARKER);
  if (i === -1) return null;
  try {
    return decodeURIComponent(url.pathname.slice(i + PUBLIC_MARKER.length));
  } catch {
    return null;
  }
}

// GET /api/expenses/[id]/receipt
// Owner may open any receipt; an employee only on their own employee-paid
// row. Redirects to a 60-second signed URL — the bucket is private.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: row, error } = await supabaseAdmin
    .from("expenses")
    .select("receipt_url, paid_by, payer_user_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("receipt lookup failed", error);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
  if (!row || !row.receipt_url) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  if (session.role !== "owner") {
    const ownRow = row.paid_by === "employee" && row.payer_user_id === session.userId;
    if (!ownRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const path = toStoragePath(row.receipt_url);
  if (!path) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from("receipts")
    .createSignedUrl(path, 60);

  if (signError || !signed) {
    console.error("receipt signing failed", signError);
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl, 302);
}
