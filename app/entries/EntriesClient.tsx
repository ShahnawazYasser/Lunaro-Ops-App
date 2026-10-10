"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
import PageHeader from "@/components/PageHeader";
import MonthSwitcher from "@/components/MonthSwitcher";
import ErrorBanner from "@/components/ErrorBanner";
import Spinner from "@/components/Spinner";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Sheet from "@/components/Sheet";
import Toast, { type ToastState } from "@/components/Toast";
import EmptyState from "@/components/EmptyState";
import { StatLine, DetailSection } from "@/components/RowList";
import ShiftEntryForm, {
  type ShiftEntryFormValues,
  type ShiftEntryPayload,
  type Venue,
} from "@/components/ShiftEntryForm";

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  venues: Venue[];
}

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
  price_charged: number | null;
  cash_received: number;
  bank_received: number;
  clock_in: string | null;
  clock_out: string | null;
  notes: string | null;
  cash_collected: boolean;
  cash_collected_at: string | null;
  last_edited_by: string | null;
  last_edited_at: string | null;
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

function formatEditedAt(ts: string): string {
  return new Date(ts).toLocaleString("en-PK", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
    timeZone: "Asia/Karachi",
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

// DB row → the shared form's string-based value shape
function rowToFormValues(row: EntryRow): ShiftEntryFormValues {
  return {
    entryDate: row.entry_date,
    clockIn: row.clock_in?.slice(0, 5) ?? "",
    clockOut: row.clock_out?.slice(0, 5) ?? "",
    venueId: row.venue_id,
    eventName: row.event_name ?? "",
    totalPrints: String(row.total_prints),
    extraPrints: String(row.extra_prints),
    systemPrints500: String(row.system_prints_500),
    systemPrints250: String(row.system_prints_250),
    freePrints: String(row.free_prints),
    wastePrints: String(row.waste_prints),
    priceCharged: row.price_charged === null ? "" : String(row.price_charged),
    cashReceived: String(row.cash_received),
    bankReceived: String(row.bank_received),
    expenses: row.entry_expenses.length
      ? row.entry_expenses.map((e) => ({
          description: e.description,
          amount: String(e.amount),
        }))
      : [{ description: "", amount: "" }],
  };
}

// ── Component ──────────────────────────────────────────────────────────────

export default function EntriesClient({ venues }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingCollect, setPendingCollect] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<EntryRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

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

  const saveEdit = async (row: EntryRow, payload: ShiftEntryPayload) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/entries/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };

      if (res.ok) {
        setEditing(null);
        showToast("success", "Entry updated");
        await fetchEntries(month);
      } else {
        showToast("error", data.error ?? "Couldn't save the changes");
      }
    } catch {
      showToast("error", "Could not save — check your connection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen pb-24 bg-bg text-text">
      <Toast toast={toast} />

      {editing && (
        <Sheet title="Edit entry" subtitle={`${editing.users.name} · ${formatDate(editing.entry_date)}`} onClose={() => setEditing(null)}>
          <ShiftEntryForm
            venues={venues}
            initialValues={rowToFormValues(editing)}
            submitLabel="Save changes"
            submitting={saving}
            dateReadOnly
            onSubmit={(payload) => saveEdit(editing, payload)}
            onError={(msg) => showToast("error", msg)}
          />
        </Sheet>
      )}

      <PageHeader title="Entries">
        <MonthSwitcher label={formatMonthLabel(month)} onPrev={() => setMonth(prevMonth)} onNext={() => setMonth(nextMonth)} />
      </PageHeader>

      {error && <ErrorBanner message={error} onRetry={() => { void fetchEntries(month); }} />}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-2">
        {loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No shift entries for this month" tall />
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
              <Card
                key={row.id}
                size="sm"
                className={`p-0! overflow-hidden ${row.cash_collected ? "border-gold/40!" : ""}`}
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
                        className="mt-0.5 shrink-0 w-9 h-9 -m-1.5 flex items-center justify-center rounded-lg disabled:opacity-50"
                      >
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                            row.cash_collected ? "bg-gold border-gold" : "bg-transparent border-[rgba(200,212,224,0.3)]"
                          }`}
                        >
                          {row.cash_collected && <span className="text-bg text-[13px] leading-none">✓</span>}
                        </span>
                      </button>

                      <div className="min-w-0">
                        <p className="text-sm font-medium">{row.users.name}</p>
                        <p className="text-xs text-text-muted">
                          {venueLabel(row)} · {formatDate(row.entry_date)}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {row.cash_collected && <Badge shape="tag">Collected</Badge>}
                          {row.last_edited_by && <Badge shape="tag" tone="outline">Edited</Badge>}
                        </div>
                      </div>
                    </div>
                    <span className={`text-sm font-semibold shrink-0 ${net >= 0 ? "text-success" : "text-danger"}`}>
                      {pkr(net)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-2 border-t border-border/70">
                    <StatLine label="Hours worked" value={hoursWorked(row.clock_in, row.clock_out)} />
                    <StatLine label="Amount received" value={pkr(amountReceived)} />
                    <StatLine label="Total prints" value={`${row.total_prints}`} />
                    <StatLine label="Free prints" value={`${row.free_prints}`} />
                  </div>
                </div>

                {expanded && (
                  <div className="px-3.5 pb-3.5 pt-3 space-y-4 border-t border-border/70">
                    <DetailSection title="Shift">
                      <StatLine label="Clock in" value={row.clock_in?.slice(0, 5) ?? "—"} />
                      <StatLine label="Clock out" value={row.clock_out?.slice(0, 5) ?? "—"} />
                      <StatLine label="Hours worked" value={hoursWorked(row.clock_in, row.clock_out)} />
                    </DetailSection>

                    <DetailSection title="Prints">
                      <StatLine label="Total (× PKR 500)" value={`${row.total_prints} · ${pkr(row.total_prints * 500)}`} />
                      <StatLine label="Extra (× PKR 250)" value={`${row.extra_prints} · ${pkr(row.extra_prints * 250)}`} />
                      <StatLine label="System @500" value={`${row.system_prints_500} · ${pkr(row.system_prints_500 * 500)}`} />
                      <StatLine label="System @250" value={`${row.system_prints_250} · ${pkr(row.system_prints_250 * 250)}`} />
                      <StatLine label="Free prints" value={`${row.free_prints}`} />
                      <StatLine label="Waste prints" value={`${row.waste_prints}`} />
                      <div className="pt-1.5 flex items-center justify-between border-t border-border/70">
                        <span className="text-xs text-text-muted">Should have collected</span>
                        <span className="text-xs font-semibold text-gold">{pkr(expected)}</span>
                      </div>
                    </DetailSection>

                    <DetailSection title="Money">
                      {row.price_charged !== null && <StatLine label="Price offered" value={pkr(row.price_charged)} />}
                      <StatLine label="Cash received" value={pkr(row.cash_received)} />
                      <StatLine label="Bank received" value={pkr(row.bank_received)} />
                      <StatLine label="Total received" value={pkr(amountReceived)} />
                      <div className="pt-1.5 flex items-center justify-between border-t border-border/70">
                        <span className="text-xs text-text-muted">Difference vs expected</span>
                        <span className={`text-xs font-semibold ${difference >= 0 ? "text-success" : "text-danger"}`}>
                          {difference >= 0 ? "+" : ""}{pkr(difference)}
                        </span>
                      </div>
                    </DetailSection>

                    {row.entry_expenses.length > 0 && (
                      <DetailSection title="Expenses">
                        {row.entry_expenses.map((exp, i) => (
                          <StatLine key={i} label={exp.description} value={pkr(exp.amount)} />
                        ))}
                        <div className="pt-1.5 flex items-center justify-between border-t border-border/70">
                          <span className="text-xs text-text-muted">Net (received − expenses)</span>
                          <span className={`text-xs font-semibold ${net >= 0 ? "text-success" : "text-danger"}`}>{pkr(net)}</span>
                        </div>
                      </DetailSection>
                    )}

                    {row.notes && (
                      <DetailSection title="Notes">
                        <p className="text-xs text-text">{row.notes}</p>
                      </DetailSection>
                    )}

                    {row.last_edited_at && (
                      <p className="text-xs text-text-muted">
                        Edited by the owner on {formatEditedAt(row.last_edited_at)}
                      </p>
                    )}

                    <Button size="lg" className="w-full" onClick={() => setEditing(row)}>
                      Edit
                    </Button>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </main>

      <BottomNav role="owner" />
    </div>
  );
}
