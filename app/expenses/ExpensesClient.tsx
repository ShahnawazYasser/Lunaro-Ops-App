"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import BottomNav from "@/components/BottomNav";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import Chip from "@/components/Chip";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import FormField, { MoneyField, InputStyles } from "@/components/FormField";
import SectionLabel from "@/components/SectionLabel";
import Toast, { type ToastState } from "@/components/Toast";
import { CATEGORIES, type Category } from "@/lib/categories";

// ── Types ──────────────────────────────────────────────────────────────────

interface Venue { id: string; name: string }
interface Employee { id: string; name: string }

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
  employees: Employee[];
}

// Matches the SELECT in GET /api/expenses.
interface ExpenseRow {
  id: string;
  expense_date: string;
  category: string;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  paid_by: "company" | "employee";
  payer_user_id: string | null;
  reimbursement_status: "pending" | "paid" | null;
  related_user_id: string | null;
  shift_entry_id: string | null;
  venue_id: string | null;
  logged_by: string;
  payer: { name: string } | null;
  related: { name: string } | null;
  logger: { name: string } | null;
  venues: { name: string } | null;
}

type PaidByChoice = "company" | "employee";

interface FormState {
  category: Category;
  amount: string;
  venueId: string;
  expenseDate: string;
  note: string;
  paidBy: PaidByChoice;
  payerUserId: string;
  relatedUserId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(m: string): string {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-PK", {
    month: "long", year: "numeric",
  });
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

function pkr(n: number) {
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

function blankForm(): FormState {
  return {
    category: "Operational",
    amount: "",
    venueId: "",
    expenseDate: localToday(),
    note: "",
    paidBy: "company",
    payerUserId: "",
    relatedUserId: "",
  };
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ExpensesClient({ user, venues, employees }: Props) {
  const [form, setForm] = useState<FormState>(blankForm);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Filter state
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterPaidBy, setFilterPaidBy] = useState<"all" | "company" | "employee">("all");

  // List state
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [pendingToggle, setPendingToggle] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Form validation
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const amountError = (() => {
    if (form.amount.trim() === "") return "Enter an amount";
    const n = Number(form.amount);
    if (n < 0) return "Can't be a negative number";
    if (n <= 0) return "Enter an amount greater than 0";
    return undefined;
  })();
  const payerError =
    form.paidBy === "employee" && !form.payerUserId ? "Pick who paid" : undefined;

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => { void fetchList(); }, [fetchList]);

  const visibleRows = filterCategory === "all" ? rows : rows.filter((r) => r.category === filterCategory);

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (amountError || payerError) {
      showToast("error", amountError ?? payerError ?? "Fix the form and try again");
      return;
    }

    setSubmitting(true);
    let receiptUrl: string | null = null;

    try {
      if (receiptFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append("file", receiptFile);
        const upRes = await fetch("/api/expenses/upload", { method: "POST", body: fd });
        setUploading(false);

        if (!upRes.ok) {
          const e = (await upRes.json()) as { error?: string };
          showToast("error", e.error ?? "Receipt upload failed");
          setSubmitting(false);
          return;
        }
        const upData = (await upRes.json()) as { url: string };
        receiptUrl = upData.url;
      }

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          amount: Number(form.amount),
          venueId: form.venueId || null,
          expenseDate: form.expenseDate,
          description: form.note,
          receiptUrl,
          paidBy: form.paidBy,
          payerUserId: form.paidBy === "employee" ? form.payerUserId : null,
          relatedUserId: form.category === "Salary" && form.relatedUserId ? form.relatedUserId : null,
        }),
      });

      if (res.ok) {
        showToast("success", "Expense logged!");
        setForm(blankForm());
        setSubmitAttempted(false);
        setReceiptFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        void fetchList();
      } else {
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Something went wrong");
      }
    } catch {
      showToast("error", "Could not submit — check your connection");
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

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

        {/* ── Log Expense Form ─────────────────────────────────── */}
        <section>
          <SectionLabel>Log Expense</SectionLabel>
          <Card className="space-y-4">
            <FormField label="Date">
              <input type="date" value={form.expenseDate}
                onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                className="input-base w-full" />
            </FormField>

            <FormField label="Category">
              <select value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
                className="input-base w-full">
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </FormField>

            {form.category === "Salary" && (
              <FormField label="Salary for">
                <select value={form.relatedUserId}
                  onChange={(e) => setForm((f) => ({ ...f, relatedUserId: e.target.value }))}
                  className="input-base w-full">
                  <option value="">— Not specific to one person —</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </FormField>
            )}

            <MoneyField label="Amount" value={form.amount}
              onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
              error={submitAttempted ? amountError : undefined} />

            <FormField label="Who paid?" error={submitAttempted ? payerError : undefined}>
              <div className="flex gap-2">
                <Chip size="md" active={form.paidBy === "company"} onClick={() => setForm((f) => ({ ...f, paidBy: "company" }))}>
                  Company paid
                </Chip>
                <Chip size="md" active={form.paidBy === "employee"} onClick={() => setForm((f) => ({ ...f, paidBy: "employee" }))}>
                  Staff member paid
                </Chip>
              </div>
              {form.paidBy === "employee" && (
                <select value={form.payerUserId}
                  onChange={(e) => setForm((f) => ({ ...f, payerUserId: e.target.value }))}
                  className="input-base w-full mt-2">
                  <option value="">— Who? —</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              )}
            </FormField>

            <FormField label="Venue (optional)">
              {venues.length === 0 ? (
                <p className="text-sm text-text-muted">No venues configured</p>
              ) : (
                <select value={form.venueId} onChange={(e) => setForm((f) => ({ ...f, venueId: e.target.value }))}
                  className="input-base w-full">
                  <option value="">— None —</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
            </FormField>

            <FormField label="Description">
              <input type="text" placeholder="e.g. August rent" value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="input-base w-full" />
            </FormField>

            <FormField label={<>Receipt photo <span className="font-normal">(optional)</span></>}>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium cursor-pointer text-text-muted bg-bg border border-[rgba(200,212,224,0.2)] rounded-[10px] px-3 py-2" />
              {receiptFile && <p className="text-xs mt-1 text-gold">{receiptFile.name}</p>}
            </FormField>

            <Button size="lg" className="w-full" onClick={handleSubmit} disabled={submitting || uploading}>
              {uploading ? "Uploading receipt…" : submitting ? "Saving…" : "Log Expense"}
            </Button>
          </Card>
        </section>

        {/* ── Filters + Totals ─────────────────────────────────── */}
        <section>
          <SectionLabel>All Expenses</SectionLabel>
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <Button variant="secondary" size="sm" className="text-sm!" onClick={() => setFilterMonth(prevMonth)} aria-label="Previous month">←</Button>
              <span className="text-sm font-medium">{formatMonth(filterMonth)}</span>
              <Button variant="secondary" size="sm" className="text-sm!" onClick={() => setFilterMonth(nextMonth)} aria-label="Next month">→</Button>
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

        {/* ── List ─────────────────────────────────────────────── */}
        <section className="space-y-2">
          {listLoading ? (
            <EmptyState message="Loading…" />
          ) : listError ? (
            <EmptyState error message={listError} onRetry={() => { void fetchList(); }} />
          ) : visibleRows.length === 0 ? (
            <EmptyState message="No expenses for this period" />
          ) : (
            visibleRows.map((row) => {
              const isStaffPaid = row.paid_by === "employee";
              const isPaid = row.reimbursement_status === "paid";
              const isShiftLinked = !!row.shift_entry_id;
              const isToggling = pendingToggle.has(row.id);

              return (
                <Card key={row.id} size="sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge>{row.category}</Badge>
                        {row.related && <span className="text-xs text-text-muted">for {row.related.name}</span>}
                        {row.venues && <span className="text-xs text-text-muted">· {row.venues.name}</span>}
                        {isStaffPaid && (
                          <Badge
                            tone={isPaid ? "gold" : "danger"}
                            disabled={isToggling}
                            onClick={() => { if (!isToggling) void toggleStatus(row); }}
                          >
                            {isPaid ? "Paid back" : `Owes ${row.payer?.name ?? "employee"}`}
                          </Badge>
                        )}
                      </div>
                      {row.description && <p className="text-sm mt-1 truncate text-text">{row.description}</p>}
                      <p className="text-xs mt-1 text-text-muted">
                        {new Date(row.expense_date + "T00:00:00").toLocaleDateString("en-PK", {
                          day: "numeric", month: "short",
                        })}
                        {row.receipt_url && (
                          <>
                            {" · "}
                            <a href={row.receipt_url} target="_blank" rel="noopener noreferrer" className="text-gold">
                              Receipt ↗
                            </a>
                          </>
                        )}
                      </p>
                      {isShiftLinked && (
                        <p className="text-xs mt-1 text-text-muted">
                          From {row.logger?.name ?? "an employee"}&apos;s shift entry — edit the entry instead
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-sm font-semibold text-text">{pkr(row.amount)}</span>
                      {!isShiftLinked && (
                        <Button variant="danger" size="xs" onClick={() => setConfirmDeleteId(row.id)}>
                          Delete
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </section>
      </main>

      <BottomNav role={user.role} />
      <InputStyles />
    </div>
  );
}
