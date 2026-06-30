"use client";

import { useState, useMemo, useCallback } from "react";
import BottomNav from "@/components/BottomNav";

// ── Types ──────────────────────────────────────────────────────────────────

interface Venue {
  id: string;
  name: string;
}

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
}

interface Expense {
  description: string;
  amount: string;
}

interface FormState {
  entryDate: string;
  clockIn: string;
  clockOut: string;
  venueId: string;
  eventName: string;
  totalPrints: string;
  extraPrints: string;
  systemPrints500: string;
  systemPrints250: string;
  freePrints: string;
  wastePrints: string;
  cashReceived: string;
  bankReceived: string;
  expenses: Expense[];
}

interface Toast {
  type: "success" | "error";
  message: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseNum(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) || n < 0 ? 0 : n;
}

function hoursWorked(clockIn: string, clockOut: string): string {
  if (!clockIn || !clockOut) return "";
  const [inH, inM] = clockIn.split(":").map(Number);
  const [outH, outM] = clockOut.split(":").map(Number);
  const diff = outH * 60 + outM - (inH * 60 + inM);
  if (diff <= 0) return "";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hrs`;
  return `${h} hrs ${m} min`;
}

function pkr(amount: number): string {
  return `PKR ${Math.round(amount).toLocaleString("en-PK")}`;
}

function blankForm(): FormState {
  return {
    entryDate: localToday(),
    clockIn: "",
    clockOut: "",
    venueId: "",
    eventName: "",
    totalPrints: "",
    extraPrints: "",
    systemPrints500: "",
    systemPrints250: "",
    freePrints: "",
    wastePrints: "",
    cashReceived: "",
    bankReceived: "",
    expenses: [{ description: "", amount: "" }],
  };
}

// ── Main component ─────────────────────────────────────────────────────────

export default function EntryClient({ user, venues }: Props) {
  const [form, setForm] = useState<FormState>(blankForm);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Live summary — derived from form state
  const summary = useMemo(() => {
    const tp = parseNum(form.totalPrints);
    const ep = parseNum(form.extraPrints);
    const s5 = parseNum(form.systemPrints500);
    const s2 = parseNum(form.systemPrints250);
    const cash = parseNum(form.cashReceived);
    const bank = parseNum(form.bankReceived);
    const expTotal = form.expenses.reduce((sum, e) => sum + parseNum(e.amount), 0);

    const expected = tp * 500 + ep * 250 + s5 * 500 + s2 * 250;
    const totalReceived = cash + bank;
    const net = totalReceived - expTotal;
    const difference = totalReceived - expected;

    return { expected, totalReceived, expTotal, net, difference };
  }, [form]);

  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    []
  );

  const setExpenseField = (index: number, key: keyof Expense, value: string) => {
    setForm((f) => {
      const expenses = [...f.expenses];
      expenses[index] = { ...expenses[index], [key]: value };
      return { ...f, expenses };
    });
  };

  const addExpense = () =>
    setForm((f) => ({
      ...f,
      expenses: [...f.expenses, { description: "", amount: "" }],
    }));

  const removeExpense = (index: number) =>
    setForm((f) => {
      const expenses = f.expenses.filter((_, i) => i !== index);
      return { ...f, expenses: expenses.length ? expenses : [{ description: "", amount: "" }] };
    });

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleSubmit = async () => {
    if (!form.venueId) {
      showToast("error", "Please select a venue");
      return;
    }
    if (form.venueId === "event" && !form.eventName.trim()) {
      showToast("error", "Please enter the event name");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryDate: form.entryDate,
          clockIn: form.clockIn || null,
          clockOut: form.clockOut || null,
          venueId: form.venueId,
          eventName: form.eventName || null,
          totalPrints: parseNum(form.totalPrints),
          extraPrints: parseNum(form.extraPrints),
          systemPrints500: parseNum(form.systemPrints500),
          systemPrints250: parseNum(form.systemPrints250),
          freePrints: parseNum(form.freePrints),
          wastePrints: parseNum(form.wastePrints),
          cashReceived: parseNum(form.cashReceived),
          bankReceived: parseNum(form.bankReceived),
          expenses: form.expenses
            .filter((e) => e.description.trim() && parseNum(e.amount) > 0)
            .map((e) => ({
              description: e.description.trim(),
              amount: parseNum(e.amount),
            })),
        }),
      });

      const data = (await res.json()) as { error?: string; updated?: boolean };

      if (res.ok) {
        showToast("success", data.updated ? "Shift updated!" : "Shift saved!");
        setForm(blankForm());
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        showToast("error", data.error ?? "Something went wrong");
      }
    } catch {
      showToast("error", "Could not submit — check your connection");
    } finally {
      setSubmitting(false);
    }
  };

  const worked = hoursWorked(form.clockIn, form.clockOut);

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B1929", color: "#E8EFF5" }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: "#0B1929",
          borderBottom: "1px solid rgba(200,212,224,0.12)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: "#C9A84C" }}>
            Lunaro Ops
          </span>
          <span className="text-sm" style={{ color: "#8A9BAD" }}>
            — {user.name}
          </span>
        </div>
      </header>

      {/* ── Toast ──────────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl text-sm font-medium shadow-xl"
          style={{
            backgroundColor: toast.type === "success" ? "#4AC47A" : "#C45A4A",
            color: "#fff",
          }}
        >
          {toast.message}
        </div>
      )}

      {/* ── Page title ─────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-2 max-w-lg mx-auto">
        <h1 className="text-xl font-semibold" style={{ color: "#E8EFF5" }}>
          Daily Entry
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "#8A9BAD" }}>
          Fill in your shift details below
        </p>
      </div>

      <main className="max-w-lg mx-auto px-4 pb-10 space-y-5">

        {/* ── Shift Details ───────────────────────────────────── */}
        <Section title="Shift Details">
          {/* Date */}
          <Field label="Date">
            <input
              type="date"
              value={form.entryDate}
              onChange={(e) => setField("entryDate", e.target.value)}
              className="input-base w-full"
            />
          </Field>

          {/* Clock in / out */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Clock In">
              <input
                type="time"
                value={form.clockIn}
                onChange={(e) => setField("clockIn", e.target.value)}
                className="input-base w-full"
              />
            </Field>
            <Field label="Clock Out">
              <input
                type="time"
                value={form.clockOut}
                onChange={(e) => setField("clockOut", e.target.value)}
                className="input-base w-full"
              />
            </Field>
          </div>

          {worked && (
            <p className="text-sm" style={{ color: "#C9A84C" }}>
              Hours worked:{" "}
              <span className="font-semibold">{worked}</span>
            </p>
          )}

          {/* Venue */}
          <Field label="Venue">
            {venues.length === 0 ? (
              <p className="text-sm" style={{ color: "#C45A4A" }}>
                No venues configured — contact the owner
              </p>
            ) : (
              <select
                value={form.venueId}
                onChange={(e) => setField("venueId", e.target.value)}
                className="input-base w-full"
              >
                <option value="">Select venue…</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
          </Field>

          {/* Event name (only when venue = event) */}
          {form.venueId === "event" && (
            <Field label="Event Name">
              <input
                type="text"
                placeholder="e.g. Ayan's Wedding"
                value={form.eventName}
                onChange={(e) => setField("eventName", e.target.value)}
                className="input-base w-full"
              />
            </Field>
          )}
        </Section>

        {/* ── Print Count ─────────────────────────────────────── */}
        <Section title="Print Count">
          <NumField
            label="Total prints"
            hint="PKR 500 each"
            value={form.totalPrints}
            onChange={(v) => setField("totalPrints", v)}
          />
          <NumField
            label="Extra prints"
            hint="PKR 250 each"
            value={form.extraPrints}
            onChange={(v) => setField("extraPrints", v)}
          />

          <Divider label="Manually printed outside the app" />
          <NumField
            label="System prints — PKR 500"
            value={form.systemPrints500}
            onChange={(v) => setField("systemPrints500", v)}
          />
          <NumField
            label="System prints — PKR 250"
            value={form.systemPrints250}
            onChange={(v) => setField("systemPrints250", v)}
          />

          <Divider label="Tracking only — not counted in revenue" />
          <NumField
            label="Free prints given"
            value={form.freePrints}
            onChange={(v) => setField("freePrints", v)}
          />
          <NumField
            label="Wasted prints"
            value={form.wastePrints}
            onChange={(v) => setField("wastePrints", v)}
          />
        </Section>

        {/* ── Money Collected ──────────────────────────────────── */}
        <Section title="Money Collected">
          <MoneyField
            label="Cash received"
            value={form.cashReceived}
            onChange={(v) => setField("cashReceived", v)}
          />
          <MoneyField
            label="Bank transfer received"
            value={form.bankReceived}
            onChange={(v) => setField("bankReceived", v)}
          />
        </Section>

        {/* ── Operational Expenses ─────────────────────────────── */}
        <Section title="Operational Expenses">
          <p className="text-xs mb-3" style={{ color: "#8A9BAD" }}>
            Day-of costs — fuel, food, supplies. These come out of the day&apos;s
            revenue, not personal reimbursements.
          </p>

          {form.expenses.map((exp, i) => (
            <div key={i} className="flex gap-2 items-start mb-3">
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  placeholder="What was it for?"
                  value={exp.description}
                  onChange={(e) => setExpenseField(i, "description", e.target.value)}
                  className="input-base w-full"
                />
                <div className="flex items-center gap-2">
                  <span className="text-sm shrink-0" style={{ color: "#8A9BAD" }}>PKR</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    min="0"
                    value={exp.amount}
                    onChange={(e) => setExpenseField(i, "amount", e.target.value)}
                    className="input-base w-full"
                  />
                </div>
              </div>
              {form.expenses.length > 1 && (
                <button
                  onClick={() => removeExpense(i)}
                  className="mt-1 w-9 h-9 flex items-center justify-center rounded-lg text-xl shrink-0"
                  style={{
                    color: "#C45A4A",
                    backgroundColor: "rgba(196,90,74,0.10)",
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}

          <button
            onClick={addExpense}
            className="w-full py-3 rounded-xl text-sm font-medium mt-1"
            style={{
              color: "#C9A84C",
              border: "1px dashed rgba(201,168,76,0.35)",
              backgroundColor: "transparent",
            }}
          >
            + Add expense
          </button>
        </Section>

        {/* ── Live Summary ─────────────────────────────────────── */}
        <Section title="Summary">
          <SummaryRow label="Should have collected" value={pkr(summary.expected)} />
          <SummaryRow label="Total received" value={pkr(summary.totalReceived)} />
          {summary.expTotal > 0 && (
            <SummaryRow
              label={`Less expenses (${pkr(summary.expTotal)})`}
              value={pkr(summary.net)}
            />
          )}
          <div
            className="pt-3 mt-1"
            style={{ borderTop: "1px solid rgba(200,212,224,0.12)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: "#8A9BAD" }}>
                Difference (received vs expected)
              </span>
              <span
                className="text-base font-semibold"
                style={{
                  color: summary.difference >= 0 ? "#4AC47A" : "#C45A4A",
                }}
              >
                {summary.difference >= 0 ? "+" : ""}
                {pkr(summary.difference)}
              </span>
            </div>
          </div>
        </Section>

        {/* ── Submit ──────────────────────────────────────────── */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 rounded-2xl text-base font-semibold transition-opacity"
          style={{
            backgroundColor: "#C9A84C",
            color: "#0B1929",
            opacity: submitting ? 0.65 : 1,
          }}
        >
          {submitting ? "Saving…" : "Submit Shift"}
        </button>
      </main>

      <BottomNav role={user.role} />

      {/* ── Scoped styles ────────────────────────────────────────── */}
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
          transition: border-color 0.15s;
        }
        .input-base:focus {
          border-color: rgba(201,168,76,0.5);
        }
        select.input-base option {
          background-color: #16293D;
        }
      `}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p
        className="text-xs font-semibold uppercase tracking-widest mb-2"
        style={{ color: "#8A9BAD" }}
      >
        {title}
      </p>
      <div
        className="rounded-2xl p-4 space-y-4"
        style={{
          backgroundColor: "#16293D",
          border: "1px solid rgba(200,212,224,0.10)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div
      className="pt-1 pb-0.5"
      style={{ borderTop: "1px solid rgba(200,212,224,0.08)" }}
    >
      <p className="text-xs" style={{ color: "#8A9BAD" }}>
        {label}
      </p>
    </div>
  );
}

function NumField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <span className="text-sm" style={{ color: "#E8EFF5" }}>
          {label}
        </span>
        {hint && (
          <span className="ml-1.5 text-xs" style={{ color: "#8A9BAD" }}>
            ({hint})
          </span>
        )}
      </div>
      <input
        type="number"
        inputMode="numeric"
        placeholder="0"
        min="0"
        step="1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-base w-24 text-right shrink-0"
        style={{ padding: "10px 12px" }}
      />
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium shrink-0" style={{ color: "#8A9BAD" }}>
          PKR
        </span>
        <input
          type="number"
          inputMode="decimal"
          placeholder="0"
          min="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-base flex-1"
        />
      </div>
    </Field>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm" style={{ color: "#8A9BAD" }}>
        {label}
      </span>
      <span className="text-sm font-semibold" style={{ color: "#E8EFF5" }}>
        {value}
      </span>
    </div>
  );
}
