"use client";

import { useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import MonthSwitcher from "@/components/MonthSwitcher";
import ErrorBanner from "@/components/ErrorBanner";
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
import { currentMonthInKarachi, formatDate, formatMonthLabel, hoursWorked } from "@/lib/dates";
import { pkr } from "@/lib/format";
import { fetchJson, invalidate, useMonthData } from "@/lib/useMonthData";

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
  initial: MineResponse;
  initialMonth: string;
}

// Matches GET /api/entries/mine
interface MyEntry {
  id: string;
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
  last_edited_by: string | null;
  venues: { name: string };
  entry_expenses: { description: string | null; amount: number; category: string }[];
  collected: boolean;
  editable: boolean;
}

interface Summary {
  shifts: number;
  cashReceived: number;
  bankReceived: number;
  totalPrints: number;
  cashNotYetCollected: number;
}

interface MineResponse {
  entries: MyEntry[];
  summary: Summary;
  availableMonths: string[];
}

function venueLabel(row: MyEntry): string {
  return row.venue_id === "event" ? (row.event_name ?? "Event") : row.venues.name;
}

function whyNotEditable(row: MyEntry): string {
  if (row.collected) return "Already collected. Ask the owner if something is wrong.";
  if (row.last_edited_by) return "The owner has edited this entry.";
  return "Older than 7 days.";
}

function rowToFormValues(row: MyEntry): ShiftEntryFormValues {
  const expenses = row.entry_expenses.map((e) => ({
    description: e.description ?? "",
    amount: String(e.amount),
    category: e.category,
  }));
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
    priceCharged: row.price_charged !== null ? String(row.price_charged) : "",
    cashReceived: String(row.cash_received),
    bankReceived: String(row.bank_received),
    notes: row.notes ?? "",
    expenses: expenses.length > 0 ? expenses : [{ description: "", amount: "", category: "Operational" }],
  };
}

function Skeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-24 rounded-2xl bg-surface animate-pulse" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-20 rounded-2xl bg-surface animate-pulse" />
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MyEntriesClient({ user, venues, initial, initialMonth }: Props) {
  const [month, setMonth] = useState(initialMonth);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<MyEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchMonth = useCallback(
    () => fetchJson<MineResponse>(`/api/entries/mine?month=${month}`, "Failed to load your entries"),
    [month],
  );
  const { data, loading, error, refresh } = useMonthData(
    `my-entries:${month}`,
    fetchMonth,
    month === initialMonth ? initial : undefined,
  );

  // Months you can move between: this month plus every month you have entries in.
  const thisMonth = currentMonthInKarachi();
  const months = [...new Set([thisMonth, ...(data?.availableMonths ?? [])])].sort().reverse();
  const idx = months.indexOf(month);
  const goOlder = () => { if (idx >= 0 && idx < months.length - 1) setMonth(months[idx + 1]); };
  const goNewer = () => { if (idx > 0) setMonth(months[idx - 1]); };

  const saveEdit = async (row: MyEntry, payload: ShiftEntryPayload) => {
    setSaving(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, entryId: row.id }),
      });
      const body = (await res.json()) as { error?: string };
      if (res.ok) {
        setEditing(null);
        showToast("success", "Entry updated");
        invalidate(["dashboard:", "attendance:", "entries:"]); // the owner's views of this entry
        await refresh();
      } else {
        showToast("error", body.error ?? "Couldn't save the changes");
      }
    } catch {
      showToast("error", "Could not save — check your connection");
    } finally {
      setSaving(false);
    }
  };

  const rows = data?.entries ?? [];
  const summary = data?.summary;

  // The edit form needs the entry's own venue even if it is no longer in the staff list.
  const formVenues = (row: MyEntry): Venue[] =>
    venues.some((v) => v.id === row.venue_id) ? venues : [...venues, { id: row.venue_id, name: row.venues.name }];

  return (
    <div className="bg-bg text-text">
      <Toast toast={toast} />

      {editing && (
        <Sheet title="Edit entry" subtitle={formatDate(editing.entry_date)} onClose={() => setEditing(null)}>
          <ShiftEntryForm
            venues={formVenues(editing)}
            initialValues={rowToFormValues(editing)}
            submitLabel="Save changes"
            submittingLabel="Saving…"
            submitting={saving}
            dateReadOnly
            onSubmit={(payload) => saveEdit(editing, payload)}
            onError={(msg) => showToast("error", msg)}
          />
        </Sheet>
      )}

      <PageHeader title="My entries" right={<span className="text-sm text-text-muted">{user.name}</span>}>
        <MonthSwitcher label={formatMonthLabel(month)} onPrev={goOlder} onNext={goNewer} />
      </PageHeader>

      {error && <ErrorBanner message={error} onRetry={() => { void refresh(); }} />}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-3">
        {loading ? (
          <Skeleton />
        ) : (
          <>
            {summary && (
              <Card>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <StatLine label="Shifts" value={`${summary.shifts}`} />
                  <StatLine label="Prints" value={`${summary.totalPrints}`} />
                  <StatLine label="Cash received" value={pkr(summary.cashReceived)} />
                  <StatLine label="Bank received" value={pkr(summary.bankReceived)} />
                </div>
                {summary.cashNotYetCollected > 0 && (
                  <p className="mt-3 rounded-xl bg-gold/15 px-3 py-2 text-sm font-semibold text-gold">
                    Cash you are holding: {pkr(summary.cashNotYetCollected)}
                  </p>
                )}
              </Card>
            )}

            <div className="space-y-3">
              {rows.length === 0 && !error ? (
                <EmptyState message="No entries in this month." tall />
              ) : (
                rows.map((row) => {
                  const expanded = expandedId === row.id;
                  const received = row.cash_received + row.bank_received;
                  const expensesTotal = row.entry_expenses.reduce((s, e) => s + e.amount, 0);
                  return (
                    <Card key={row.id} size="sm" className="p-0! overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : row.id)}
                        className="w-full text-left p-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{venueLabel(row)}</p>
                            <p className="text-xs text-text-muted">{formatDate(row.entry_date)}</p>
                          </div>
                          {row.collected ? (
                            <Badge tone="muted" shape="tag">Collected</Badge>
                          ) : (
                            <Badge tone="gold" shape="tag">With you</Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-x-3 mt-2 pt-2 border-t border-border/70">
                          <StatLine label="Cash" value={pkr(row.cash_received)} />
                          <StatLine label="Bank" value={pkr(row.bank_received)} />
                          <StatLine label="Prints" value={`${row.total_prints}`} />
                        </div>
                      </button>

                      {expanded && (
                        <div className="px-3.5 pb-3.5 pt-3 space-y-4 border-t border-border/70">
                          <DetailSection title="Shift">
                            <StatLine label="Clock in" value={row.clock_in?.slice(0, 5) ?? "—"} />
                            <StatLine label="Clock out" value={row.clock_out?.slice(0, 5) ?? "—"} />
                            <StatLine label="Hours worked" value={hoursWorked(row.clock_in, row.clock_out) || "—"} />
                          </DetailSection>
                          <DetailSection title="Prints">
                            <StatLine label="Total" value={`${row.total_prints}`} />
                            <StatLine label="Extra" value={`${row.extra_prints}`} />
                            <StatLine label="Free" value={`${row.free_prints}`} />
                            <StatLine label="Wasted" value={`${row.waste_prints}`} />
                          </DetailSection>
                          <DetailSection title="Money">
                            <StatLine label="Cash received" value={pkr(row.cash_received)} />
                            <StatLine label="Bank received" value={pkr(row.bank_received)} />
                            <StatLine label="Total received" value={pkr(received)} />
                          </DetailSection>
                          {row.entry_expenses.length > 0 && (
                            <DetailSection title="Expenses">
                              {row.entry_expenses.map((exp, i) => (
                                <StatLine key={i} label={`${exp.description ?? "Expense"} · ${exp.category}`} value={pkr(exp.amount)} />
                              ))}
                              <StatLine label="Total expenses" value={pkr(expensesTotal)} />
                            </DetailSection>
                          )}
                          {row.notes && (
                            <DetailSection title="Notes">
                              <p className="text-xs text-text">{row.notes}</p>
                            </DetailSection>
                          )}

                          {row.editable ? (
                            <Button size="lg" className="w-full" onClick={() => setEditing(row)}>
                              Edit
                            </Button>
                          ) : (
                            <p className="text-xs text-text-muted">{whyNotEditable(row)}</p>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })
              )}
            </div>
          </>
        )}
      </main>

    </div>
  );
}
