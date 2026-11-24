import { NextRequest, NextResponse } from "next/server";
import { requireSession, fail, dataError } from "@/lib/api";
import { getMyEntries } from "@/lib/data/entries";
import { currentMonthInKarachi } from "@/lib/dates";
import { isMonth } from "@/lib/validate";

export const preferredRegion = "sin1";

// GET /api/entries/mine?month=YYYY-MM — any role. ONLY the signed-in user's
// own entries. There is deliberately no user id parameter: whatever a caller
// sends is ignored, the session decides whose entries these are.
export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const monthParam = new URL(request.url).searchParams.get("month");
  if (monthParam !== null && !isMonth(monthParam)) return fail(400, "Invalid month (expected YYYY-MM)");

  try {
    return NextResponse.json(await getMyEntries(session.userId, monthParam ?? currentMonthInKarachi()));
  } catch (e) {
    return dataError(e);
  }
}
