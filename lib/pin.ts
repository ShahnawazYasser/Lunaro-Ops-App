// PIN helpers. Server-side only (bcrypt) — except isWeakPin, which is pure.
// PINs are bcrypt-hashed at cost 12 and never logged, stored or returned in clear.
import bcrypt from "bcryptjs";

const COST = 12;

export function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, COST);
}

export function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

// Returns a plain-language reason if the PIN is not acceptable, else null.
// 4–8 digits; no repeated digit (0000, 1111…), no straight run up or down
// (1234, 4321, 12345, 9876, 7890), which are the first things anyone guesses.
export function isWeakPin(pin: string): string | null {
  if (!/^\d{4,8}$/.test(pin)) return "Use 4 to 8 digits.";
  const d = pin.split("").map(Number);
  if (d.every((x) => x === d[0])) return "Don't repeat one digit. Pick something harder to guess.";
  const step = (a: number, b: number) => (b - a + 10) % 10;
  if (d.slice(1).every((x, i) => step(d[i], x) === 1)) return "Don't use a straight run like 1234. Pick something harder to guess.";
  if (d.slice(1).every((x, i) => step(d[i], x) === 9)) return "Don't use a straight run like 4321. Pick something harder to guess.";
  return null;
}
