import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export interface SessionUser {
  userId: string;
  name: string;
  role: "employee" | "owner";
  // session_version the token was issued at. A mismatch with the user's current
  // version means the session was revoked (PIN change/reset, deactivation).
  sv: number;
  // True until the person has chosen their own PIN. Middleware reads this from
  // the token; API routes and pages re-check it against the database.
  mustSetPin: boolean;
}

// Payload shape stored inside the JWT
interface SessionPayload extends SessionUser {
  iat?: number;
  exp?: number;
}

const COOKIE_NAME = "lunaro-session";
const EMPLOYEE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days — staff re-entering a PIN daily is friction
const OWNER_MAX_AGE = 60 * 60 * 12; // 12 hours — the owner account is the one worth protecting

export function sessionMaxAge(role: "employee" | "owner"): number {
  return role === "owner" ? OWNER_MAX_AGE : EMPLOYEE_MAX_AGE;
}

function getSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET env var is not set");
  if (s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    userId: user.userId,
    name: user.name,
    role: user.role,
    sv: user.sv,
    mustSetPin: user.mustSetPin,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${sessionMaxAge(user.role)}s`)
    .sign(getSecret());
}

async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getSecret());
    const { userId, name, role, sv, mustSetPin } = payload;
    if (typeof userId !== "string" || typeof name !== "string" || typeof role !== "string") {
      return null;
    }
    if (role !== "employee" && role !== "owner") return null;
    // Tokens from before revocable sessions have no `sv` — treated as signed out.
    if (typeof sv !== "number") return null;
    return { userId, name, role, sv, mustSetPin: mustSetPin === true };
  } catch {
    return null;
  }
}

// Server Components and Route Handlers
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// Middleware (reads from NextRequest, no async cookies() needed)
export async function getSessionFromRequest(
  request: NextRequest
): Promise<SessionUser | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

// Cookie options for a given role (owner sessions are shorter).
export function sessionCookie(role: "employee" | "owner", value: string) {
  return {
    ...sessionCookieConfig,
    maxAge: sessionMaxAge(role),
    value,
    secure: process.env.NODE_ENV === "production",
  };
}

export const sessionCookieConfig = {
  name: COOKIE_NAME,
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  // secure: true is set at call-site based on NODE_ENV
};
