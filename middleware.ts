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

  // Still on a temporary PIN: nothing but the set-PIN screen until they choose one.
  // (API routes enforce the same rule server-side; this only steers pages.)
  if (session.mustSetPin) {
    if (pathname === "/set-pin") return NextResponse.next();
    return NextResponse.redirect(new URL("/set-pin", request.url));
  }

  // Authenticated — redirect away from root, landing page by role. /login is
  // decided by the login page itself, which checks the database (a stale
  // cookie there must not loop back into the app).
  if (pathname === "/") {
    const landingPath = session.role === "owner" ? "/dashboard" : "/entry";
    return NextResponse.redirect(new URL(landingPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Run on page routes only; skip API routes, static files, Next.js
  // internals, and the PWA assets (manifest, service worker, icons) —
  // these must be fetchable unauthenticated or they get redirected to
  // /login and served HTML where the browser expects JSON/JS/images.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest\\.json|sw\\.js|apple-touch-icon\\.png|icons/).*)",
  ],
};
