import { NextRequest, NextResponse } from "next/server";
import { requireOwner, dataError } from "@/lib/api";
import { isMonth } from "@/lib/validate";
import { getDashboard } from "@/lib/data/dashboard";

export const preferredRegion = "sin1";

// GET /api/dashboard?month=2026-06
export async function GET(request: NextRequest) {
  const session = await requireOwner();
  if (session instanceof NextResponse) return session;

  const month = new URL(request.url).searchParams.get("month");
  if (!month || !isMonth(month)) {
    return NextResponse.json({ error: "Invalid month (expected YYYY-MM)" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getDashboard(month));
  } catch (e) {
    return dataError(e);
  }
}
