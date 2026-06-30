import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export interface SessionUser {
  userId: string;
  name: string;
  role: "employee" | "owner";
}

// Payload shape stored inside the JWT
interface SessionPayload extends SessionUser {
  iat?: number;
  exp?: number;
}

const COOKIE_NAME = "lunaro-session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days in seconds

function getSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET env var is not set");
  return new TextEncoder().encode(s);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ userId: user.userId, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecret());
}

async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify<SessionPayload>(token, getSecret());
    const { userId, name, role } = payload;
    if (typeof userId !== "string" || typeof name !== "string" || typeof role !== "string") {
      return null;
    }
    if (role !== "employee" && role !== "owner") return null;
    return { userId, name, role };
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

export const sessionCookieConfig = {
  name: COOKIE_NAME,
  maxAge: SESSION_MAX_AGE,
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  // secure: true is set at call-site based on NODE_ENV
};
