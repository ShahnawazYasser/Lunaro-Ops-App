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
  extra_prints: number;
  system_prints_500: number;
  system_prints_250: number;
  free_prints: number;
  waste_prints: number;
  cash_received: number;
  bank_received: number;
  clock_in: string | null;
  clock_out: string | null;
  notes: string | null;
  cash_collected: boolean;
  cash_collected_at: string | null;
  users: { name: string };
  venues: { name: string };
  entry_expenses: { description: string; amount: number }[];
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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingCollect, setPendingCollect] = useState<Set<string>>(new Set());

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

  const toggleExpanded = (id: string) => {
    setExpandedId((cur) => (cur === id ? null : id));
  };

  const toggleCollected = async (row: EntryRow) => {
    const nextCollected = !row.cash_collected;

    // Optimistic update
    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id
          ? {
              ...r,
              cash_collected: nextCollected,
              cash_collected_at: nextCollected ? new Date().toISOString() : null,
            }
          : r
      )
    );
    setPendingCollect((prev) => new Set(prev).add(row.id));

    try {
      const res = await fetch(`/api/entries/${row.id}/collect`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collected: nextCollected }),
      });

      if (!res.ok) {
        // Revert on failure
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? row : r))
        );
        setError("Couldn't update collected status — try again");
      }
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      setError("Couldn't update collected status — try again");
    } finally {
      setPendingCollect((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

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
        <div className="mx-4 mt-4 p-3 rounded-xl text-sm flex items-center justify-between gap-3" style={{ backgroundColor: "rgba(196,90,74,0.15)", color: "#C45A4A", border: "1px solid rgba(196,90,74,0.3)" }}>
          <span>{error}</span>
          <button onClick={() => { void fetchEntries(month); }}
            className="shrink-0 text-xs px-3 py-1 rounded-lg" style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.4)" }}>
            Try again
          </button>
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
            const expanded = expandedId === row.id;
            const isPending = pendingCollect.has(row.id);

            const expected =
              row.total_prints * 500 +
              row.extra_prints * 250 +
              row.system_prints_500 * 500 +
              row.system_prints_250 * 250;
            const difference = amountReceived - expected;

            return (
              <div
                key={row.id}
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: "#16293D",
                  border: row.cash_collected
                    ? "1px solid rgba(201,168,76,0.4)"
                    : "1px solid rgba(200,212,224,0.10)",
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleExpanded(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleExpanded(row.id);
                    }
                  }}
                  className="w-full text-left p-3.5 cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {/* Collect checkbox — separate hit area, stops propagation */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isPending) void toggleCollected(row);
                        }}
                        disabled={isPending}
                        aria-label={row.cash_collected ? "Mark as not collected" : "Mark as collected"}
                        className="mt-0.5 shrink-0 w-9 h-9 -m-1.5 flex items-center justify-center rounded-lg"
                        style={{ opacity: isPending ? 0.5 : 1 }}
                      >
                        <span
                          className="w-5 h-5 rounded-md flex items-center justify-center"
                          style={{
                            backgroundColor: row.cash_collected ? "#C9A84C" : "transparent",
                            border: row.cash_collected
                              ? "1px solid #C9A84C"
                              : "1px solid rgba(200,212,224,0.3)",
                          }}
                        >
                          {row.cash_collected && (
                            <span style={{ color: "#0B1929", fontSize: "13px", lineHeight: 1 }}>✓</span>
                          )}
                        </span>
                      </button>

                      <div className="min-w-0">
                        <p className="text-sm font-medium">{row.users.name}</p>
                        <p className="text-xs" style={{ color: "#8A9BAD" }}>
                          {venueLabel(row)} · {formatDate(row.entry_date)}
                        </p>
                        {row.cash_collected && (
                          <span
                            className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}
                          >
                            Collected
                          </span>
                        )}
                      </div>
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

                {expanded && (
                  <div
                    className="px-3.5 pb-3.5 pt-3 space-y-4"
                    style={{ borderTop: "1px solid rgba(200,212,224,0.08)" }}
                  >
                    <DetailSection title="Shift">
                      <EntryStat label="Clock in" value={row.clock_in?.slice(0, 5) ?? "—"} />
                      <EntryStat label="Clock out" value={row.clock_out?.slice(0, 5) ?? "—"} />
                      <EntryStat label="Hours worked" value={hoursWorked(row.clock_in, row.clock_out)} />
                    </DetailSection>

                    <DetailSection title="Prints">
                      <EntryStat label="Total (× PKR 500)" value={`${row.total_prints} · ${pkr(row.total_prints * 500)}`} />
                      <EntryStat label="Extra (× PKR 250)" value={`${row.extra_prints} · ${pkr(row.extra_prints * 250)}`} />
                      <EntryStat label="System @500" value={`${row.system_prints_500} · ${pkr(row.system_prints_500 * 500)}`} />
                      <EntryStat label="System @250" value={`${row.system_prints_250} · ${pkr(row.system_prints_250 * 250)}`} />
                      <EntryStat label="Free prints" value={`${row.free_prints}`} />
                      <EntryStat label="Waste prints" value={`${row.waste_prints}`} />
                      <div className="pt-1.5 flex items-center justify-between" style={{ borderTop: "1px solid rgba(200,212,224,0.08)" }}>
                        <span className="text-xs" style={{ color: "#8A9BAD" }}>Should have collected</span>
                        <span className="text-xs font-semibold" style={{ color: "#C9A84C" }}>{pkr(expected)}</span>
                      </div>
                    </DetailSection>

                    <DetailSection title="Money">
                      <EntryStat label="Cash received" value={pkr(row.cash_received)} />
                      <EntryStat label="Bank received" value={pkr(row.bank_received)} />
                      <EntryStat label="Total received" value={pkr(amountReceived)} />
                      <div className="pt-1.5 flex items-center justify-between" style={{ borderTop: "1px solid rgba(200,212,224,0.08)" }}>
                        <span className="text-xs" style={{ color: "#8A9BAD" }}>Difference vs expected</span>
                        <span className="text-xs font-semibold" style={{ color: difference >= 0 ? "#4AC47A" : "#C45A4A" }}>
                          {difference >= 0 ? "+" : ""}{pkr(difference)}
                        </span>
                      </div>
                    </DetailSection>

                    {row.entry_expenses.length > 0 && (
                      <DetailSection title="Expenses">
                        {row.entry_expenses.map((exp, i) => (
                          <EntryStat key={i} label={exp.description} value={pkr(exp.amount)} />
                        ))}
                        <div className="pt-1.5 flex items-center justify-between" style={{ borderTop: "1px solid rgba(200,212,224,0.08)" }}>
                          <span className="text-xs" style={{ color: "#8A9BAD" }}>Net (received − expenses)</span>
                          <span className="text-xs font-semibold" style={{ color: net >= 0 ? "#4AC47A" : "#C45A4A" }}>{pkr(net)}</span>
                        </div>
                      </DetailSection>
                    )}

                    {row.notes && (
                      <DetailSection title="Notes">
                        <p className="text-xs" style={{ color: "#E8EFF5" }}>{row.notes}</p>
                      </DetailSection>
                    )}
                  </div>
                )}
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

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "#8A9BAD" }}>
        {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
