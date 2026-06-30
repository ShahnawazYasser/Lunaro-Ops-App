import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const session = await getSessionFromRequest(request);

  if (!session) {
    // Unauthenticated — let /login through, redirect everything else
    if (pathname === "/login") return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Authenticated — redirect away from /login and root
  if (pathname === "/login" || pathname === "/") {
    return NextResponse.redirect(new URL("/entry", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on page routes only; skip API routes, static files, Next.js internals
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
