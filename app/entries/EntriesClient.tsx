"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";

// ── Types ──────────────────────────────────────────────────────────────────

interface EntryRow {
  id: string;
  user_id: string;
  entry_date: string;
  venue_id: string;
  event_name: string | null;
  total_prints: number;
  free_prints: number;
  cash_received: number;
  bank_received: number;
  clock_in: string | null;
  clock_out: string | null;
  users: { name: string };
  venues: { name: string };
  entry_expenses: { amount: number }[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-PK", {
    month: "long", year: "numeric",
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PK", {
    day: "numeric", month: "short",
  });
}

function pkr(n: number): string {
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

// clock_in/clock_out come back from Postgres as "HH:MM:SS"
function hoursWorked(clockIn: string | null, clockOut: string | null): string {
  if (!clockIn || !clockOut) return "—";
  const [inH, inM] = clockIn.split(":").map(Number);
  const [outH, outM] = clockOut.split(":").map(Number);
  const diff = outH * 60 + outM - (inH * 60 + inM);
  if (diff <= 0) return "—";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hrs`;
  return `${h} hrs ${m} min`;
}

function venueLabel(row: EntryRow): string {
  return row.venue_id === "event" ? (row.event_name ?? "Event") : row.venues.name;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function EntriesClient() {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries?month=${m}`);
      if (res.ok) {
        const d = (await res.json()) as { entries: EntryRow[] };
        setRows(d.entries);
      } else {
        const e = (await res.json()) as { error?: string };
        setError(e.error ?? "Failed to load entries");
      }
    } catch {
      setError("Could not reach server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchEntries(month); }, [month, fetchEntries]);

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B1929", color: "#E8EFF5" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 px-4 py-3"
        style={{ backgroundColor: "#0B1929", borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold" style={{ color: "#C9A84C" }}>Entries</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
            Owner
          </span>
        </div>

        {/* Month switcher */}
        <div className="flex items-center justify-between">
          <button onClick={() => setMonth(prevMonth)}
            className="px-4 py-1.5 rounded-lg text-sm"
            style={{ color: "#8A9BAD", border: "1px solid rgba(200,212,224,0.15)" }}>
            ←
          </button>
          <span className="text-sm font-medium">{formatMonthLabel(month)}</span>
          <button onClick={() => setMonth(nextMonth)}
            className="px-4 py-1.5 rounded-lg text-sm"
            style={{ color: "#8A9BAD", border: "1px solid rgba(200,212,224,0.15)" }}>
            →
          </button>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-4 p-3 rounded-xl text-sm" style={{ backgroundColor: "rgba(196,90,74,0.15)", color: "#C45A4A", border: "1px solid rgba(196,90,74,0.3)" }}>
          {error}
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: "#C9A84C" }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-sm" style={{ color: "#8A9BAD" }}>
            No shift entries for this month
          </div>
        ) : (
          rows.map((row) => {
            const amountReceived = row.cash_received + row.bank_received;
            const expensesTotal = row.entry_expenses.reduce((s, e) => s + e.amount, 0);
            const net = amountReceived - expensesTotal;

            return (
              <div key={row.id} className="rounded-xl p-3.5"
                style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="text-sm font-medium">{row.users.name}</p>
                    <p className="text-xs" style={{ color: "#8A9BAD" }}>
                      {venueLabel(row)} · {formatDate(row.entry_date)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold shrink-0" style={{ color: net >= 0 ? "#4AC47A" : "#C45A4A" }}>
                    {pkr(net)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2" style={{ borderTop: "1px solid rgba(200,212,224,0.08)" }}>
                  <EntryStat label="Hours worked" value={hoursWorked(row.clock_in, row.clock_out)} />
                  <EntryStat label="Amount received" value={pkr(amountReceived)} />
                  <EntryStat label="Total prints" value={`${row.total_prints}`} />
                  <EntryStat label="Free prints" value={`${row.free_prints}`} />
                </div>
              </div>
            );
          })
        )}
      </main>

      <BottomNav role="owner" />
    </div>
  );
}

function EntryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs" style={{ color: "#8A9BAD" }}>{label}</span>
      <span className="text-xs font-medium" style={{ color: "#E8EFF5" }}>{value}</span>
    </div>
  );
}
