"use client";

import { useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExpenseForm from "@/components/ExpenseForm";
import ExpenseList, { type ExpenseRow } from "@/components/ExpenseList";
import { InputStyles } from "@/components/FormField";
import MonthSwitcher from "@/components/MonthSwitcher";
import SectionLabel from "@/components/SectionLabel";
import Toast, { type ToastState } from "@/components/Toast";
import { formatMonthLabel, shiftMonth } from "@/lib/dates";
import { pkr } from "@/lib/format";
import { fetchJson, invalidate, useMonthData } from "@/lib/useMonthData";

// ── Types ──────────────────────────────────────────────────────────────────

interface Venue { id: string; name: string }

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
  initial: { expenses: ExpenseRow[] };
  initialMonth: string;
}

// "My Expenses" — the employee-facing view onto the unified `expenses` table
// (Phase D API, Phase E screen). Employees only ever see and log their own
// employee-paid rows; the API enforces that server-side regardless of what
// this client sends. Owner-facing money-out lives on /expenses instead.

// ── Main component ─────────────────────────────────────────────────────────

export default function ReimburseClient({ user, venues, initial, initialMonth }: Props) {
  const [toast, setToast] = useState<ToastState | null>(null);

  // Filter state
  const [filterMonth, setFilterMonth] = useState(initialMonth);

  // List state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const key = `my-expenses:${filterMonth}`;
  const fetchList = useCallback(() => {
    const params = new URLSearchParams({ month: filterMonth, userId: user.id, paidBy: "employee" });
    return fetchJson<{ expenses: ExpenseRow[] }>(`/api/expenses?${params}`, "Failed to load expenses");
  }, [filterMonth, user.id]);
  const { data, loading: listLoading, error: listError, refresh, setData } = useMonthData(
    key,
    fetchList,
    filterMonth === initialMonth ? initial : undefined,
  );
  const rows = data?.expenses ?? [];
  const setRows = (update: (prev: ExpenseRow[]) => ExpenseRow[]) =>
    setData((prev) => ({ ...prev, expenses: update(prev.expenses) }));

  // Money-out changed: the owner's dashboard and expenses list are out of date.
  const expensesChanged = () => invalidate(["dashboard:", "expenses:"]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        expensesChanged();
        showToast("success", "Expense deleted");
      } else {
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Couldn't delete this expense");
      }
    } catch {
      showToast("error", "Could not reach server — check your connection");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  // Running total of pending (still-waiting) expenses for the month
  const youreOwed = rows
    .filter((r) => r.reimbursement_status !== "paid")
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="bg-bg text-text">
      <PageHeader
        title="My Expenses"
        right={<span className="text-sm text-text-muted">{user.name}</span>}
      />
      <Toast toast={toast} />

      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete this expense?"
          message="This can't be undone."
          busy={deletingId === confirmDeleteId}
          onConfirm={() => { void handleDelete(confirmDeleteId); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">

        <ExpenseForm variant="employee" venues={venues} onToast={showToast} onLogged={() => { expensesChanged(); void refresh(); }} />

        {/* ── Past expenses ────────────────────────────────────── */}
        <section>
          <SectionLabel>Past Expenses</SectionLabel>
          <Card className="space-y-3">
            <MonthSwitcher label={formatMonthLabel(filterMonth)}
              onPrev={() => setFilterMonth((m) => shiftMonth(m, -1))} onNext={() => setFilterMonth((m) => shiftMonth(m, 1))} />

            <div className="pt-1 border-t border-border">
              <span className="text-xs text-text-muted">You&apos;re owed: </span>
              <span className={`text-sm font-semibold ${youreOwed > 0 ? "text-gold" : "text-text-muted"}`}>
                {pkr(youreOwed)}
              </span>
            </div>
          </Card>
        </section>

        <ExpenseList
          variant="employee"
          rows={rows}
          loading={listLoading}
          error={listError}
          onRetry={() => { void refresh(); }}
          onDelete={setConfirmDeleteId}
        />
      </main>

      <InputStyles />
    </div>
  );
}
