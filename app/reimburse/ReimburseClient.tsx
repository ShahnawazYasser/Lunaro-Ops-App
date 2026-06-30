"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import BottomNav from "@/components/BottomNav";

// ── Types ──────────────────────────────────────────────────────────────────

interface Venue { id: string; name: string }
interface Employee { id: string; name: string }

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
  employees: Employee[];
}

const CATEGORIES = ["Petrol", "Food", "Misc"] as const;
type Category = (typeof CATEGORIES)[number];

interface ReimbursementRow {
  id: string;
  user_id: string;
  category: Category;
  amount: number;
  description: string | null;
  receipt_url: string | null;
  status: string;
  expense_date: string;
  venue_id: string | null;
  users: { name: string };
  venues: { name: string } | null;
}

interface FormState {
  category: Category;
  amount: string;
  venueId: string;
  expenseDate: string;
  note: string;
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
  return { category: "Petrol", amount: "", venueId: "", expenseDate: localToday(), note: "" };
}

// ── Main component ─────────────────────────────────────────────────────────

export default function ReimburseClient({ user, venues, employees }: Props) {
  const [form, setForm] = useState<FormState>(blankForm);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Filter state
  const [filterMonth, setFilterMonth] = useState(currentMonth);
  const [filterUserId, setFilterUserId] = useState<string>("all");

  // List state
  const [rows, setRows] = useState<ReimbursementRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

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

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams({ month: filterMonth, userId: filterUserId });
      const res = await fetch(`/api/reimbursements?${params}`);
      if (res.ok) {
        const data = (await res.json()) as { reimbursements: ReimbursementRow[] };
        setRows(data.reimbursements);
      } else {
        const e = (await res.json()) as { error?: string };
        setListError(e.error ?? "Failed to load expenses");
      }
    } catch {
      setListError("Could not reach server — check your connection");
    } finally {
      setListLoading(false);
    }
  }, [filterMonth, filterUserId]);

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
        const upRes = await fetch("/api/reimbursements/upload", { method: "POST", body: fd });
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

      const res = await fetch("/api/reimbursements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category,
          amount: Number(form.amount),
          venueId: form.venueId || null,
          expenseDate: form.expenseDate,
          note: form.note,
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

  // Totals per employee for the selected month
  const totals = employees.reduce<Record<string, number>>((acc, emp) => {
    acc[emp.id] = rows
      .filter((r) => r.user_id === emp.id && r.status !== "paid")
      .reduce((s, r) => s + r.amount, 0);
    return acc;
  }, {});

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B1929", color: "#E8EFF5" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: "#0B1929", borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
        <span className="font-semibold" style={{ color: "#C9A84C" }}>Reimbursements</span>
        <span className="text-sm" style={{ color: "#8A9BAD" }}>{user.name}</span>
      </header>

      {/* Toast */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl text-sm font-medium shadow-xl"
          style={{ backgroundColor: toast.type === "success" ? "#4AC47A" : "#C45A4A", color: "#fff" }}>
          {toast.message}
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

            {/* Category */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Category</label>
              <div className="flex gap-2">
                {CATEGORIES.map((cat) => (
                  <button key={cat} onClick={() => setForm((f) => ({ ...f, category: cat }))}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
                    style={{
                      backgroundColor: form.category === cat ? "rgba(201,168,76,0.15)" : "#0B1929",
                      color: form.category === cat ? "#C9A84C" : "#8A9BAD",
                      border: form.category === cat ? "1px solid rgba(201,168,76,0.5)" : "1px solid rgba(200,212,224,0.15)",
                    }}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

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

            {/* Date */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Date</label>
              <input type="date" value={form.expenseDate}
                onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
                className="input-base w-full" />
            </div>

            {/* Note */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Note</label>
              <input type="text" placeholder="e.g. Fuel to Third Culture" value={form.note}
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

        {/* ── Filters ──────────────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8A9BAD" }}>
            Past Expenses
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

            {/* Employee filter */}
            <div className="flex gap-2 flex-wrap">
              <FilterChip label="All" active={filterUserId === "all"} onClick={() => setFilterUserId("all")} />
              {employees.map((emp) => (
                <FilterChip key={emp.id} label={emp.name} active={filterUserId === emp.id} onClick={() => setFilterUserId(emp.id)} />
              ))}
            </div>

            {/* Totals */}
            <div className="flex flex-wrap gap-3 pt-1" style={{ borderTop: "1px solid rgba(200,212,224,0.08)" }}>
              {employees.map((emp) => (
                <div key={emp.id}>
                  <span className="text-xs" style={{ color: "#8A9BAD" }}>{emp.name} owed: </span>
                  <span className="text-xs font-semibold" style={{ color: "#C9A84C" }}>
                    {pkr(totals[emp.id] ?? 0)}
                  </span>
                </div>
              ))}
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
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: "#8A9BAD" }}>No expenses for this period</div>
          ) : (
            rows.map((row) => (
              <div key={row.id} className="rounded-xl p-3.5"
                style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
                        {row.category}
                      </span>
                      <span className="text-xs" style={{ color: "#8A9BAD" }}>
                        {row.users?.name}
                      </span>
                      {row.venues && (
                        <span className="text-xs" style={{ color: "#8A9BAD" }}>· {row.venues.name}</span>
                      )}
                      <StatusBadge status={row.status} />
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
                  </div>
                  <span className="text-sm font-semibold shrink-0" style={{ color: "#E8EFF5" }}>
                    {pkr(row.amount)}
                  </span>
                </div>
              </div>
            ))
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    pending: { bg: "rgba(138,155,173,0.15)", text: "#8A9BAD" },
    approved: { bg: "rgba(74,196,122,0.15)", text: "#4AC47A" },
    paid: { bg: "rgba(201,168,76,0.15)", text: "#C9A84C" },
  };
  const c = colors[status] ?? colors["pending"];
  return (
    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}>
      {status}
    </span>
  );
}
