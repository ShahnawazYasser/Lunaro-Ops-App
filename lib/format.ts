// Client-safe formatting helpers. No server imports here.

/** "PKR 1,200" — rounded, en-PK separators. */
export function pkr(n: number): string {
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

/** "1 day" / "3 days". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
