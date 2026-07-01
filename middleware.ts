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

  // Authenticated — redirect away from /login and root, landing page by role
  if (pathname === "/login" || pathname === "/") {
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
