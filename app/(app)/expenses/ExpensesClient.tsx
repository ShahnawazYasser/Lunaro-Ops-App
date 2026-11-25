"use client";

import { useState, useCallback } from "react";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";
import Chip from "@/components/Chip";
import ConfirmDialog from "@/components/ConfirmDialog";
import ExpenseForm from "@/components/ExpenseForm";
import ExpenseList, { type ExpenseRow } from "@/components/ExpenseList";
import { InputStyles } from "@/components/FormField";
import SectionLabel from "@/components/SectionLabel";
import Toast, { type ToastState } from "@/components/Toast";
import { CATEGORIES } from "@/lib/categories";
import { formatMonthLabel, shiftMonth } from "@/lib/dates";
import { pkr } from "@/lib/format";
import { fetchJson, invalidate, useMonthData } from "@/lib/useMonthData";

// ── Types ──────────────────────────────────────────────────────────────────

interface Venue { id: string; name: string }
interface Employee { id: string; name: string }

interface Props {
  venues: Venue[];
  employees: Employee[];
  initial: { expenses: ExpenseRow[] };
  initialMonth: string;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ExpensesClient({ venues, employees, initial, initialMonth }: Props) {
  const [toast, setToast] = useState<ToastState | null>(null);

  // Filter state
  const [filterMonth, setFilterMonth] = useState(initialMonth);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPaidBy, setFilterPaidBy] = useState<"all" | "company" | "employee">("all");

  // List state
  const [pendingToggle, setPendingToggle] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const key = `expenses:${filterMonth}:${filterPaidBy}`;
  const fetchList = useCallback(() => {
    const params = new URLSearchParams({ month: filterMonth, paidBy: filterPaidBy, userId: "all" });
    return fetchJson<{ expenses: ExpenseRow[] }>(`/api/expenses?${params}`, "Failed to load expenses");
  }, [filterMonth, filterPaidBy]);
  const { data, loading: listLoading, error: listError, refresh, setData } = useMonthData(
    key,
    fetchList,
    filterMonth === initialMonth && filterPaidBy === "all" ? initial : undefined,
  );
  const rows = data?.expenses ?? [];
  const setRows = (update: (prev: ExpenseRow[]) => ExpenseRow[]) =>
    setData((prev) => ({ ...prev, expenses: update(prev.expenses) }));

  // Money-out changed: the dashboard's totals and the other filtered views of
  // this screen, and the staff's own list, are out of date.
  const expensesChanged = () => invalidate(["dashboard:", "expenses:", "my-expenses:"], key);

  const visibleRows = filterCategory === "all" ? rows : rows.filter((r) => r.category === filterCategory);

  const toggleStatus = async (row: ExpenseRow) => {
    const next = row.reimbursement_status === "paid" ? "pending" : "paid";

    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, reimbursement_status: next } : r)));
    setPendingToggle((prev) => new Set(prev).add(row.id));

    try {
      const res = await fetch(`/api/expenses/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reimbursementStatus: next }),
      });
      if (res.ok) {
        expensesChanged();
      } else {
        setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Couldn't update — try again");
      }
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      showToast("error", "Couldn't update — try again");
    } finally {
      setPendingToggle((prev) => {
        const next2 = new Set(prev);
        next2.delete(row.id);
        return next2;
      });
    }
  };

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

  // Totals for the month
  const totalExpenses = rows.reduce((s, r) => s + r.amount, 0);
  const owedByEmployee = employees.reduce<Record<string, number>>((acc, emp) => {
    acc[emp.id] = rows
      .filter((r) => r.paid_by === "employee" && r.payer_user_id === emp.id && r.reimbursement_status === "pending")
      .reduce((s, r) => s + r.amount, 0);
    return acc;
  }, {});

  return (
    <div className="bg-bg text-text">
      <PageHeader title="Expenses" />
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

        <ExpenseForm variant="owner" venues={venues} employees={employees} onToast={showToast} onLogged={() => { expensesChanged(); void refresh(); }} />

        {/* ── Filters + Totals ─────────────────────────────────── */}
        <section>
          <SectionLabel>All Expenses</SectionLabel>
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="secondary" size="sm" className="text-sm!" onClick={() => setFilterMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">←</Button>
              <span className="text-sm font-medium">{formatMonthLabel(filterMonth)}</span>
              <Button variant="secondary" size="sm" className="text-sm!" onClick={() => setFilterMonth((m) => shiftMonth(m, 1))} aria-label="Next month">→</Button>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Chip active={filterPaidBy === "all"} onClick={() => setFilterPaidBy("all")}>All</Chip>
              <Chip active={filterPaidBy === "company"} onClick={() => setFilterPaidBy("company")}>Company</Chip>
              <Chip active={filterPaidBy === "employee"} onClick={() => setFilterPaidBy("employee")}>Staff</Chip>
            </div>

            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="input-base w-full">
              <option value="all">All categories</option>
              {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            <div className="space-y-1.5 pt-1 border-t border-border/70">
              <div>
                <span className="text-xs text-text-muted">Total this month: </span>
                <span className="text-sm font-semibold text-text">{pkr(totalExpenses)}</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {employees.map((emp) => (
                  <div key={emp.id}>
                    <span className="text-xs text-text-muted">Owes {emp.name}: </span>
                    <span className={`text-xs font-semibold ${(owedByEmployee[emp.id] ?? 0) > 0 ? "text-gold" : "text-text-muted"}`}>
                      {pkr(owedByEmployee[emp.id] ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </section>

        <ExpenseList
          variant="owner"
          rows={visibleRows}
          loading={listLoading}
          error={listError}
          onRetry={() => { void refresh(); }}
          onDelete={setConfirmDeleteId}
          onToggleStatus={(row) => { void toggleStatus(row); }}
          togglingIds={pendingToggle}
        />
      </main>

      <InputStyles />
    </div>
  );
}
