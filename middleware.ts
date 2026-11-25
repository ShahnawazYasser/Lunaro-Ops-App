import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/session";

// Pages only the owner may open. The token's role is signed, so this is a safe
// early redirect that keeps a real 307 (a page's own redirect() would arrive as
// a 200 once the loading skeleton has started streaming). Every page still
// re-checks the role against the database; that check stays the authority.
const OWNER_ONLY_PAGES = [
  "/dashboard", "/entries", "/expenses", "/bookings", "/payouts",
  "/assets", "/recurring", "/draws", "/attendance", "/users",
];

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

  if (session.role !== "owner" && OWNER_ONLY_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return NextResponse.redirect(new URL("/entry", request.url));
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
