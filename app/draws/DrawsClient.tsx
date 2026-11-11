"use client";

import { useState, useCallback, useEffect } from "react";
import BottomNav from "@/components/BottomNav";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import FormField, { MoneyField, InputStyles } from "@/components/FormField";
import MonthSwitcher from "@/components/MonthSwitcher";
import SectionLabel from "@/components/SectionLabel";
import Toast, { type ToastState } from "@/components/Toast";

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  user: { id: string; name: string; role: string };
  // Accepted so the page matches the other owner screens; draws aren't tied to a venue.
  venues: { id: string; name: string }[];
}

// Matches the SELECT in GET /api/draws.
interface DrawRow {
  id: string;
  expense_date: string;
  amount: number;
  description: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonth(): string {
  return localToday().slice(0, 7);
}

function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(m: string): string {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-PK", {
    month: "long",
    year: "numeric",
  });
}

function pkr(n: number) {
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function DrawsClient({ user }: Props) {
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<DrawRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  // Bumped to force a refetch for the same month (after add / retry).
  const [reloadTick, setReloadTick] = useState(0);

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localToday);
  const [note, setNote] = useState("");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const amountError = (() => {
    if (amount.trim() === "") return "Enter an amount";
    if (Number(amount) <= 0) return "Amount must be greater than 0";
    return undefined;
  })();

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/draws?month=${month}`);
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { draws: DrawRow[] };
          setRows(data.draws);
          setListError(null);
        } else {
          const e = (await res.json()) as { error?: string };
          setListError(e.error ?? "Failed to load draws");
        }
      } catch {
        if (!cancelled) setListError("Could not reach server — check your connection");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [month, reloadTick]);

  const reload = () => {
    setListLoading(true);
    setListError(null);
    setReloadTick((t) => t + 1);
  };

  const changeMonth = (delta: number) => {
    setListLoading(true);
    setListError(null);
    setMonth((m) => shiftMonth(m, delta));
  };

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (amountError) {
      showToast("error", amountError);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/draws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          expenseDate: date,
          description: note.trim() || null,
        }),
      });
      if (res.ok) {
        showToast("success", "Draw logged!");
        setAmount("");
        setNote("");
        setSubmitAttempted(false);
        // Jump to the month of the date just logged so the new row is visible.
        if (date.slice(0, 7) !== month) {
          setListLoading(true);
          setMonth(date.slice(0, 7));
        } else {
          reload();
        }
      } else {
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Something went wrong");
      }
    } catch {
      showToast("error", "Could not submit — check your connection");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/draws/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        showToast("success", "Draw deleted");
      } else {
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Couldn't delete this draw");
      }
    } catch {
      showToast("error", "Could not reach server — check your connection");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const total = rows.reduce((s, r) => s + r.amount, 0);

  return (
    <div className="min-h-screen pb-24 bg-bg text-text">
      <PageHeader title="Owner Draws" />
      <Toast toast={toast} />

      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete this draw?"
          message="This can't be undone."
          busy={deletingId === confirmDeleteId}
          onConfirm={() => { void handleDelete(confirmDeleteId); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        <p className="text-xs text-text-muted">
          Money you take out of the business for yourself. It&apos;s kept for the cash
          record but never counted as an expense or taken off profit.
        </p>

        {/* ── Log a draw ─────────────────────────────────────── */}
        <section>
          <SectionLabel>Log a Draw</SectionLabel>
          <Card className="space-y-4">
            <FormField label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="input-base w-full" />
            </FormField>

            <MoneyField label="Amount" value={amount} onChange={setAmount}
              error={submitAttempted ? amountError : undefined} />

            <FormField label={<>Note <span className="font-normal">(optional)</span></>}>
              <input type="text" placeholder="e.g. Personal expenses" value={note}
                onChange={(e) => setNote(e.target.value)} className="input-base w-full" />
            </FormField>

            <Button size="lg" className="w-full" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving…" : "Log Draw"}
            </Button>
          </Card>
        </section>

        {/* ── List ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <MonthSwitcher label={formatMonth(month)}
            onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)} />

          <div className="flex items-center justify-between">
            <SectionLabel className="">Draws this month</SectionLabel>
            {!listLoading && !listError && rows.length > 0 && (
              <span className="text-sm font-semibold text-gold">{pkr(total)}</span>
            )}
          </div>

          {listLoading ? (
            <EmptyState message="Loading…" />
          ) : listError ? (
            <EmptyState error message={listError} onRetry={reload} />
          ) : rows.length === 0 ? (
            <EmptyState message="No draws this month" />
          ) : (
            rows.map((r) => (
              <Card key={r.id} size="sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text">{pkr(r.amount)}</p>
                    <p className="text-xs mt-1 text-text-muted">
                      {new Date(r.expense_date + "T00:00:00").toLocaleDateString("en-PK", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                      {r.description ? ` · ${r.description}` : ""}
                    </p>
                  </div>
                  <Button variant="danger" size="xs" className="shrink-0"
                    onClick={() => setConfirmDeleteId(r.id)}>
                    Delete
                  </Button>
                </div>
              </Card>
            ))
          )}
        </section>
      </main>

      <BottomNav role={user.role} />
      <InputStyles />
    </div>
  );
}
