import { NextResponse } from "next/server";
import type { SessionUser } from "@/lib/session";
import { getVerifiedSession } from "@/lib/auth";
import { DataError } from "@/lib/data/errors";

// Shared guards and error helpers for API routes.
//
//   const session = await requireOwner();
//   if (session instanceof NextResponse) return session;

// `allowMustSetPin` is only for POST /api/auth/set-pin: a person who still has
// a temporary PIN may do nothing else until they choose their own.
export async function requireSession(
  opts: { allowMustSetPin?: boolean } = {}
): Promise<SessionUser | NextResponse> {
  const session = await getVerifiedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.mustSetPin && !opts.allowMustSetPin) {
    return NextResponse.json({ error: "Choose your own PIN first." }, { status: 403 });
  }
  return session;
}

export async function requireOwner(): Promise<SessionUser | NextResponse> {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.role !== "owner") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return session;
}

// A failure response. `publicMessage` is what the client sees; `internal`
// (a raw error, query detail, …) only ever goes to the server log.
export function fail(status: number, publicMessage: string, internal?: unknown): NextResponse {
  if (internal !== undefined) console.error(publicMessage, internal);
  return NextResponse.json({ error: publicMessage }, { status });
}

interface DbErrorLike {
  code?: string;
  message?: string;
}

// Maps a database error to a plain message. The real error is logged
// server-side and never returned.
export function dbError(error: DbErrorLike): NextResponse {
  console.error("database error", error);
  if (error.code === "23505") return NextResponse.json({ error: "That already exists" }, { status: 409 });
  if (error.code === "23503") {
    return NextResponse.json({ error: "That refers to something that no longer exists" }, { status: 400 });
  }
  // Malformed value (bad uuid, number out of range, impossible date): the caller sent bad input.
  if (error.code === "22P02" || error.code === "22003" || error.code === "22007" || error.code === "22008") {
    return NextResponse.json({ error: "One of the values isn't valid" }, { status: 400 });
  }
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

// Turns anything thrown by lib/data/* into a response: a database failure maps
// through dbError, anything else is logged and returned as a plain 500.
export function dataError(e: unknown): NextResponse {
  if (e instanceof DataError) return dbError(e.db);
  return fail(500, "Something went wrong. Try again.", e);
}
