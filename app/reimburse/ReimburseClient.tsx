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
import MonthSwitcher from "@/components/MonthSwitcher";
import SectionLabel from "@/components/SectionLabel";
import Toast, { type ToastState } from "@/components/Toast";
import { EMPLOYEE_CATEGORIES, type EmployeeCategory } from "@/lib/categories";

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
interface ExpenseRow {
  id: string;
  category: string;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  reimbursement_status: string | null;
  expense_date: string;
  venue_id: string | null;
  venues: { name: string } | null;
}

interface FormState {
  category: EmployeeCategory;
  amount: string;
  venueId: string;
  expenseDate: string;
  note: string;
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
  return { category: "Petrol", amount: "", venueId: "", expenseDate: localToday(), note: "" };
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ReimburseClient({ user, venues }: Props) {
  const [form, setForm] = useState<FormState>(blankForm);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Filter state
  const [filterMonth, setFilterMonth] = useState(currentMonth);

  // List state
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
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

  useEffect(() => { void fetchList(); }, [fetchList]);

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (amountError) {
      showToast("error", amountError);
      return;
    }

    setSubmitting(true);
    let receiptUrl: string | null = null;

    try {
      // Upload receipt if one was selected
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

        {/* ── Log Expense Form ─────────────────────────────────── */}
        <section>
          <SectionLabel>Log Expense</SectionLabel>
          <Card className="space-y-4">
            <FormField label="Category">
              <div className="grid grid-cols-2 gap-2">
                {EMPLOYEE_CATEGORIES.map((cat) => (
                  <Chip key={cat} size="md" active={form.category === cat}
                    onClick={() => setForm((f) => ({ ...f, category: cat }))}>
                    {cat}
                  </Chip>
                ))}
              </div>
            </FormField>

            <MoneyField label="Amount" value={form.amount}
              onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
              error={submitAttempted ? amountError : undefined} />

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

            <FormField label="Date">
              <input type="date" value={form.expenseDate}
                onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                className="input-base w-full" />
            </FormField>

            <FormField label="Note">
              <input type="text" placeholder="e.g. Fuel to Third Culture" value={form.note}
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

        {/* ── Past expenses ────────────────────────────────────── */}
        <section>
          <SectionLabel>Past Expenses</SectionLabel>
          <Card className="space-y-3">
            <MonthSwitcher label={formatMonth(filterMonth)}
              onPrev={() => setFilterMonth(prevMonth)} onNext={() => setFilterMonth(nextMonth)} />

            <div className="pt-1 border-t border-border">
              <span className="text-xs text-text-muted">You're owed: </span>
              <span className={`text-sm font-semibold ${youreOwed > 0 ? "text-gold" : "text-text-muted"}`}>
                {pkr(youreOwed)}
              </span>
            </div>
          </Card>
        </section>

        {/* ── List ─────────────────────────────────────────────── */}
        <section className="space-y-2">
          {listLoading ? (
            <EmptyState message="Loading…" />
          ) : listError ? (
            <EmptyState error message={listError} onRetry={() => { void fetchList(); }} />
          ) : rows.length === 0 ? (
            <EmptyState message="No expenses for this period" />
          ) : (
            rows.map((row) => {
              const isPaid = row.reimbursement_status === "paid";
              return (
                <Card key={row.id} size="sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge>{row.category}</Badge>
                        {row.venues && <span className="text-xs text-text-muted">{row.venues.name}</span>}
                        <Badge tone={isPaid ? "gold" : "muted"}>{isPaid ? "Paid back" : "Waiting"}</Badge>
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
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-sm font-semibold text-text">{pkr(row.amount)}</span>
                      {!isPaid && (
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
