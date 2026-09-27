import { NextResponse } from "next/server";
import { sessionCookieConfig } from "@/lib/session";

export const preferredRegion = "sin1";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: sessionCookieConfig.name,
    value: "",
    maxAge: 0,
    httpOnly: true,
    path: "/",
  });
  return response;
}
