"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExpenseForm from "@/components/ExpenseForm";
import ExpenseList, { type ExpenseRow } from "@/components/ExpenseList";
import { InputStyles } from "@/components/FormField";
import MonthSwitcher from "@/components/MonthSwitcher";
import SectionLabel from "@/components/SectionLabel";
import Toast, { type ToastState } from "@/components/Toast";
import { defer } from "@/lib/defer";
import { currentMonthInKarachi, formatMonthLabel, shiftMonth } from "@/lib/dates";
import { pkr } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────────────

interface Venue { id: string; name: string }

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
}

// "My Expenses" — the employee-facing view onto the unified `expenses` table
// (Phase D API, Phase E screen). Employees only ever see and log their own
// employee-paid rows; the API enforces that server-side regardless of what
// this client sends. Owner-facing money-out lives on /expenses instead.

// ── Main component ─────────────────────────────────────────────────────────

export default function ReimburseClient({ user, venues }: Props) {
  const [toast, setToast] = useState<ToastState | null>(null);

  // Filter state
  const [filterMonth, setFilterMonth] = useState(currentMonthInKarachi);

  // List state
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({
        month: filterMonth,
        userId: user.id,
        paidBy: "employee",
      });
      const res = await fetch(`/api/expenses?${params}`);
      if (res.ok) {
        const data = (await res.json()) as { expenses: ExpenseRow[] };
        setRows(data.expenses);
      } else {
        const e = (await res.json()) as { error?: string };
        setListError(e.error ?? "Failed to load expenses");
      }
    } catch {
      setListError("Could not reach server — check your connection");
    } finally {
      setListLoading(false);
    }
  }, [filterMonth, user.id]);

  useEffect(() => defer(() => { void fetchList(); }), [fetchList]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
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
    <div className="min-h-screen pb-24 bg-bg text-text">
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

        <ExpenseForm variant="employee" venues={venues} onToast={showToast} onLogged={() => { void fetchList(); }} />

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
          onRetry={() => { void fetchList(); }}
          onDelete={setConfirmDeleteId}
        />
      </main>

      <BottomNav role={user.role} />
      <InputStyles />
    </div>
  );
}
