// Thrown by lib/data/* when a database query fails. API routes turn it into a
// plain-message response with `dataError` (lib/api.ts); pages let it reach the
// error boundary. The raw error never reaches a client.
export interface DbErrorLike {
  code?: string;
  message?: string;
}

export class DataError extends Error {
  readonly db: DbErrorLike;
  constructor(db: DbErrorLike) {
    super(db.message ?? "database error");
    this.name = "DataError";
    this.db = db;
  }
}

/** Throws a DataError when a Supabase result carries an error. */
export function check(error: DbErrorLike | null): void {
  if (error) throw new DataError(error);
}
