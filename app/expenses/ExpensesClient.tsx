"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
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
import { defer } from "@/lib/defer";
import { currentMonthInKarachi, formatMonthLabel, shiftMonth } from "@/lib/dates";
import { pkr } from "@/lib/format";

// ── Types ──────────────────────────────────────────────────────────────────

interface Venue { id: string; name: string }
interface Employee { id: string; name: string }

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
  employees: Employee[];
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ExpensesClient({ user, venues, employees }: Props) {
  const [toast, setToast] = useState<ToastState | null>(null);

  // Filter state
  const [filterMonth, setFilterMonth] = useState(currentMonthInKarachi);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPaidBy, setFilterPaidBy] = useState<"all" | "company" | "employee">("all");

  // List state
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<Set<string>>(new Set());
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
        paidBy: filterPaidBy,
        userId: "all",
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
  }, [filterMonth, filterPaidBy]);

  useEffect(() => defer(() => { void fetchList(); }), [fetchList]);

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
      if (!res.ok) {
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
    <div className="min-h-screen pb-24 bg-bg text-text">
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

        <ExpenseForm variant="owner" venues={venues} employees={employees} onToast={showToast} onLogged={() => { void fetchList(); }} />

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
          onRetry={() => { void fetchList(); }}
          onDelete={setConfirmDeleteId}
          onToggleStatus={(row) => { void toggleStatus(row); }}
          togglingIds={pendingToggle}
        />
      </main>

      <BottomNav role={user.role} />
      <InputStyles />
    </div>
  );
}
