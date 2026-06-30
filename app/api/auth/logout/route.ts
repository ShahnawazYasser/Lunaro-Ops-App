import { NextResponse } from "next/server";
import { sessionCookieConfig } from "@/lib/session";

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
