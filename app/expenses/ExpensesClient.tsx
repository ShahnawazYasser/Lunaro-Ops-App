"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import BottomNav from "@/components/BottomNav";
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

interface Toast { type: "success" | "error"; message: string }

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
  const [toast, setToast] = useState<Toast | null>(null);

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

  const showToast = useCallback((type: Toast["type"], message: string) => {
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
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B1929", color: "#E8EFF5" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: "#0B1929", borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
        <span className="font-semibold" style={{ color: "#C9A84C" }}>Expenses</span>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
          Owner
        </span>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl text-sm font-medium shadow-xl"
          style={{ backgroundColor: toast.type === "success" ? "#4AC47A" : "#C45A4A", color: "#fff" }}>
          {toast.message}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: "rgba(11,25,41,0.75)" }}>
          <div className="w-full max-w-sm rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.15)" }}>
            <p className="text-sm font-medium">Delete this expense?</p>
            <p className="text-xs" style={{ color: "#8A9BAD" }}>This can't be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ color: "#8A9BAD", border: "1px solid rgba(200,212,224,0.15)" }}>
                Cancel
              </button>
              <button onClick={() => { void handleDelete(confirmDeleteId); }}
                disabled={deletingId === confirmDeleteId}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "#C45A4A", color: "#fff", opacity: deletingId === confirmDeleteId ? 0.6 : 1 }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* ── Log Expense Form ─────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8A9BAD" }}>
            Log Expense
          </p>
          <div className="rounded-2xl p-4 space-y-4"
            style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Date</label>
              <input type="date" value={form.expenseDate}
                onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                className="input-base w-full" />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Category</label>
              <select value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
                className="input-base w-full">
                {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>

            {/* Salary for */}
            {form.category === "Salary" && (
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Salary for</label>
                <select value={form.relatedUserId}
                  onChange={(e) => setForm((f) => ({ ...f, relatedUserId: e.target.value }))}
                  className="input-base w-full">
                  <option value="">— Not specific to one person —</option>
                  {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
            )}

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Amount</label>
              <div className="flex items-center gap-2">
                <span className="text-sm shrink-0" style={{ color: "#8A9BAD" }}>PKR</span>
                <input type="number" inputMode="decimal" placeholder="0" min="0"
                  value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  className="input-base flex-1"
                  style={{ borderColor: submitAttempted && amountError ? "#C45A4A" : undefined }} />
              </div>
              {submitAttempted && amountError && (
                <p className="text-xs mt-1" style={{ color: "#C45A4A" }}>{amountError}</p>
              )}
            </div>

            {/* Who paid */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Who paid?</label>
              <div className="flex gap-2">
                <button onClick={() => setForm((f) => ({ ...f, paidBy: "company" }))}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    backgroundColor: form.paidBy === "company" ? "rgba(201,168,76,0.15)" : "#0B1929",
                    color: form.paidBy === "company" ? "#C9A84C" : "#8A9BAD",
                    border: form.paidBy === "company" ? "1px solid rgba(201,168,76,0.5)" : "1px solid rgba(200,212,224,0.15)",
                  }}>
                  Company paid
                </button>
                <button onClick={() => setForm((f) => ({ ...f, paidBy: "employee" }))}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                  style={{
                    backgroundColor: form.paidBy === "employee" ? "rgba(201,168,76,0.15)" : "#0B1929",
                    color: form.paidBy === "employee" ? "#C9A84C" : "#8A9BAD",
                    border: form.paidBy === "employee" ? "1px solid rgba(201,168,76,0.5)" : "1px solid rgba(200,212,224,0.15)",
                  }}>
                  Staff member paid
                </button>
              </div>
              {form.paidBy === "employee" && (
                <>
                  <select value={form.payerUserId}
                    onChange={(e) => setForm((f) => ({ ...f, payerUserId: e.target.value }))}
                    className="input-base w-full mt-2"
                    style={{ borderColor: submitAttempted && payerError ? "#C45A4A" : undefined }}>
                    <option value="">— Who? —</option>
                    {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                  {submitAttempted && payerError && (
                    <p className="text-xs mt-1" style={{ color: "#C45A4A" }}>{payerError}</p>
                  )}
                </>
              )}
            </div>

            {/* Venue */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Venue (optional)</label>
              {venues.length === 0 ? (
                <p className="text-sm" style={{ color: "#8A9BAD" }}>No venues configured</p>
              ) : (
                <select value={form.venueId} onChange={(e) => setForm((f) => ({ ...f, venueId: e.target.value }))}
                  className="input-base w-full">
                  <option value="">— None —</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Description</label>
              <input type="text" placeholder="e.g. August rent" value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="input-base w-full" />
            </div>

            {/* Receipt upload */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>
                Receipt photo{" "}
                <span className="font-normal" style={{ color: "#8A9BAD" }}>(optional)</span>
              </label>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium cursor-pointer"
                style={{
                  color: "#8A9BAD",
                  backgroundColor: "#0B1929",
                  border: "1px solid rgba(200,212,224,0.2)",
                  borderRadius: "10px",
                  padding: "8px 12px",
                }} />
              {receiptFile && (
                <p className="text-xs mt-1" style={{ color: "#C9A84C" }}>
                  {receiptFile.name}
                </p>
              )}
            </div>

            {/* Submit */}
            <button onClick={handleSubmit} disabled={submitting || uploading}
              className="w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity"
              style={{ backgroundColor: "#C9A84C", color: "#0B1929", opacity: submitting ? 0.65 : 1 }}>
              {uploading ? "Uploading receipt…" : submitting ? "Saving…" : "Log Expense"}
            </button>
          </div>
        </section>

        {/* ── Filters + Totals ─────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8A9BAD" }}>
            All Expenses
          </p>
          <div className="rounded-2xl p-4 space-y-3"
            style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>

            {/* Month switcher */}
            <div className="flex items-center justify-between">
              <button onClick={() => setFilterMonth(prevMonth)}
                className="px-3 py-1.5 rounded-lg text-sm" style={{ color: "#8A9BAD", border: "1px solid rgba(200,212,224,0.15)" }}>
                ←
              </button>
              <span className="text-sm font-medium" style={{ color: "#E8EFF5" }}>
                {formatMonth(filterMonth)}
              </span>
              <button onClick={() => setFilterMonth(nextMonth)}
                className="px-3 py-1.5 rounded-lg text-sm" style={{ color: "#8A9BAD", border: "1px solid rgba(200,212,224,0.15)" }}>
                →
              </button>
            </div>

            {/* Paid-by filter */}
            <div className="flex gap-2 flex-wrap">
              <FilterChip label="All" active={filterPaidBy === "all"} onClick={() => setFilterPaidBy("all")} />
              <FilterChip label="Company" active={filterPaidBy === "company"} onClick={() => setFilterPaidBy("company")} />
              <FilterChip label="Staff" active={filterPaidBy === "employee"} onClick={() => setFilterPaidBy("employee")} />
            </div>

            {/* Category filter */}
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="input-base w-full">
              <option value="all">All categories</option>
              {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            {/* Totals */}
            <div className="space-y-1.5 pt-1" style={{ borderTop: "1px solid rgba(200,212,224,0.08)" }}>
              <div>
                <span className="text-xs" style={{ color: "#8A9BAD" }}>Total this month: </span>
                <span className="text-sm font-semibold" style={{ color: "#E8EFF5" }}>{pkr(totalExpenses)}</span>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {employees.map((emp) => (
                  <div key={emp.id}>
                    <span className="text-xs" style={{ color: "#8A9BAD" }}>Owes {emp.name}: </span>
                    <span className="text-xs font-semibold" style={{ color: (owedByEmployee[emp.id] ?? 0) > 0 ? "#C9A84C" : "#8A9BAD" }}>
                      {pkr(owedByEmployee[emp.id] ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── List ─────────────────────────────────────────────── */}
        <section className="space-y-2">
          {listLoading ? (
            <div className="text-center py-8 text-sm" style={{ color: "#8A9BAD" }}>Loading…</div>
          ) : listError ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm" style={{ color: "#C45A4A" }}>{listError}</p>
              <button onClick={() => { void fetchList(); }}
                className="text-sm px-4 py-1.5 rounded-lg" style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.4)" }}>
                Try again
              </button>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: "#8A9BAD" }}>No expenses for this period</div>
          ) : (
            visibleRows.map((row) => {
              const isStaffPaid = row.paid_by === "employee";
              const isPaid = row.reimbursement_status === "paid";
              const isShiftLinked = !!row.shift_entry_id;
              const isToggling = pendingToggle.has(row.id);

              return (
                <div key={row.id} className="rounded-xl p-3.5"
                  style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
                          {row.category}
                        </span>
                        {row.related && (
                          <span className="text-xs" style={{ color: "#8A9BAD" }}>for {row.related.name}</span>
                        )}
                        {row.venues && (
                          <span className="text-xs" style={{ color: "#8A9BAD" }}>· {row.venues.name}</span>
                        )}
                        {isStaffPaid && (
                          <button onClick={() => { if (!isToggling) void toggleStatus(row); }}
                            disabled={isToggling}
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              backgroundColor: isPaid ? "rgba(201,168,76,0.15)" : "rgba(196,90,74,0.15)",
                              color: isPaid ? "#C9A84C" : "#C45A4A",
                              opacity: isToggling ? 0.6 : 1,
                            }}>
                            {isPaid ? "Paid back" : `Owes ${row.payer?.name ?? "employee"}`}
                          </button>
                        )}
                      </div>
                      {row.description && (
                        <p className="text-sm mt-1 truncate" style={{ color: "#E8EFF5" }}>{row.description}</p>
                      )}
                      <p className="text-xs mt-1" style={{ color: "#8A9BAD" }}>
                        {new Date(row.expense_date + "T00:00:00").toLocaleDateString("en-PK", {
                          day: "numeric", month: "short",
                        })}
                        {row.receipt_url && (
                          <>
                            {" · "}
                            <a href={row.receipt_url} target="_blank" rel="noopener noreferrer"
                              style={{ color: "#C9A84C" }}>
                              Receipt ↗
                            </a>
                          </>
                        )}
                      </p>
                      {isShiftLinked && (
                        <p className="text-xs mt-1" style={{ color: "#8A9BAD" }}>
                          From {row.logger?.name ?? "an employee"}&apos;s shift entry — edit the entry instead
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-sm font-semibold" style={{ color: "#E8EFF5" }}>
                        {pkr(row.amount)}
                      </span>
                      {!isShiftLinked && (
                        <button onClick={() => setConfirmDeleteId(row.id)}
                          className="text-xs px-2 py-1 rounded-lg"
                          style={{ color: "#C45A4A", border: "1px solid rgba(196,90,74,0.35)" }}>
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </main>

      <BottomNav role={user.role} />

      <style>{`
        .input-base {
          background-color: #0B1929;
          color: #E8EFF5;
          border: 1px solid rgba(200,212,224,0.2);
          border-radius: 10px;
          padding: 12px 14px;
          font-size: 16px;
          line-height: 1.4;
          outline: none;
        }
        .input-base:focus { border-color: rgba(201,168,76,0.5); }
        select.input-base option { background-color: #16293D; }
        input[type="number"] { appearance: textfield; -moz-appearance: textfield; }
        input[type="date"], input[type="time"] { color-scheme: dark; }
      `}</style>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-3 py-1 rounded-lg text-xs font-medium transition-all"
      style={{
        backgroundColor: active ? "rgba(201,168,76,0.15)" : "#0B1929",
        color: active ? "#C9A84C" : "#8A9BAD",
        border: active ? "1px solid rgba(201,168,76,0.4)" : "1px solid rgba(200,212,224,0.12)",
      }}>
      {label}
    </button>
  );
}
