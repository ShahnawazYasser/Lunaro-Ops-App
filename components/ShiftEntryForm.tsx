"use client";

import { useState, useMemo, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Venue {
  id: string;
  name: string;
}

export interface ExpenseValue {
  description: string;
  amount: string;
}

/** Every field of the shift entry form, as raw strings (input values). */
export interface ShiftEntryFormValues {
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
  expenses: ExpenseValue[];
}

/** Parsed, API-shaped payload handed to the submit handler. */
export interface ShiftEntryPayload {
  entryDate: string;
  clockIn: string | null;
  clockOut: string | null;
  venueId: string;
  eventName: string | null;
  totalPrints: number;
  extraPrints: number;
  systemPrints500: number;
  systemPrints250: number;
  freePrints: number;
  wastePrints: number;
  cashReceived: number;
  bankReceived: number;
  expenses: { description: string; amount: number }[];
}

interface Props {
  venues: Venue[];
  initialValues: ShiftEntryFormValues;
  submitLabel: string;
  submittingLabel?: string;
  /** Parent-owned in-flight state — disables the submit button. */
  submitting: boolean;
  /** Fully read-only: every input disabled, submit hidden. */
  disabled?: boolean;
  /** Owner edit locks the date — it's part of the entry's identity. */
  dateReadOnly?: boolean;
  onSubmit: (payload: ShiftEntryPayload) => void | Promise<void>;
  /** Form-level validation messages the parent should surface (e.g. a toast). */
  onError: (message: string) => void;
  /** Fired when the user changes the date (parent may clear a stale banner). */
  onDateChange?: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function blankShiftEntryValues(): ShiftEntryFormValues {
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

const NEGATIVE_MSG = "Can't be a negative number";

function validateForm(form: ShiftEntryFormValues): {
  fieldErrors: Partial<Record<keyof ShiftEntryFormValues, string>>;
  expenseErrors: Record<number, string>;
} {
  const fieldErrors: Partial<Record<keyof ShiftEntryFormValues, string>> = {};
  const checks: [keyof ShiftEntryFormValues, string][] = [
    ["totalPrints", form.totalPrints],
    ["extraPrints", form.extraPrints],
    ["systemPrints500", form.systemPrints500],
    ["systemPrints250", form.systemPrints250],
    ["freePrints", form.freePrints],
    ["wastePrints", form.wastePrints],
    ["cashReceived", form.cashReceived],
    ["bankReceived", form.bankReceived],
  ];

  for (const [key, raw] of checks) {
    if (raw.trim() !== "" && parseFloat(raw) < 0) {
      fieldErrors[key] = NEGATIVE_MSG;
    }
  }

  const expenseErrors: Record<number, string> = {};
  form.expenses.forEach((exp, i) => {
    if (exp.amount.trim() !== "" && parseFloat(exp.amount) < 0) {
      expenseErrors[i] = NEGATIVE_MSG;
    }
  });

  return { fieldErrors, expenseErrors };
}

// ── Form ───────────────────────────────────────────────────────────────────

export default function ShiftEntryForm({
  venues,
  initialValues,
  submitLabel,
  submittingLabel = "Saving…",
  submitting,
  disabled = false,
  dateReadOnly = false,
  onSubmit,
  onError,
  onDateChange,
}: Props) {
  const [form, setForm] = useState<ShiftEntryFormValues>(initialValues);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const { fieldErrors, expenseErrors } = useMemo(() => validateForm(form), [form]);
  const hasErrors =
    Object.keys(fieldErrors).length > 0 || Object.keys(expenseErrors).length > 0;

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
    <K extends keyof ShiftEntryFormValues>(key: K, value: ShiftEntryFormValues[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    []
  );

  const setExpenseField = (index: number, key: keyof ExpenseValue, value: string) => {
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
      return {
        ...f,
        expenses: expenses.length ? expenses : [{ description: "", amount: "" }],
      };
    });

  const handleSubmit = async () => {
    setSubmitAttempted(true);

    if (!form.venueId) {
      onError("Please select a venue");
      return;
    }
    if (form.venueId === "event" && !form.eventName.trim()) {
      onError("Please enter the event name");
      return;
    }
    if (hasErrors) {
      onError("Fix the highlighted fields before submitting");
      return;
    }

    await onSubmit({
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
    });
  };

  const worked = hoursWorked(form.clockIn, form.clockOut);

  return (
    <div className="space-y-5">
      {/* ── Shift Details ───────────────────────────────────── */}
      <Section title="Shift Details">
        {/* Date */}
        <Field label="Date">
          <div className="min-w-0 overflow-hidden">
            <input
              type="date"
              value={form.entryDate}
              disabled={disabled || dateReadOnly}
              onChange={(e) => {
                setField("entryDate", e.target.value);
                onDateChange?.();
              }}
              className="input-base w-full"
            />
          </div>
          {dateReadOnly && (
            <p className="text-xs mt-1" style={{ color: "#8A9BAD" }}>
              The date can&apos;t be changed here
            </p>
          )}
        </Field>

        {/* Clock in / out */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Clock In">
            <div className="min-w-0 overflow-hidden">
              <input
                type="time"
                value={form.clockIn}
                disabled={disabled}
                onChange={(e) => setField("clockIn", e.target.value)}
                className="input-base w-full"
              />
            </div>
          </Field>
          <Field label="Clock Out">
            <div className="min-w-0 overflow-hidden">
              <input
                type="time"
                value={form.clockOut}
                disabled={disabled}
                onChange={(e) => setField("clockOut", e.target.value)}
                className="input-base w-full"
              />
            </div>
          </Field>
        </div>

        {worked && (
          <p className="text-sm" style={{ color: "#C9A84C" }}>
            Hours worked: <span className="font-semibold">{worked}</span>
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
              disabled={disabled}
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
              disabled={disabled}
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
          disabled={disabled}
          onChange={(v) => setField("totalPrints", v)}
          error={submitAttempted ? fieldErrors.totalPrints : undefined}
        />
        <NumField
          label="Extra prints"
          hint="PKR 250 each"
          value={form.extraPrints}
          disabled={disabled}
          onChange={(v) => setField("extraPrints", v)}
          error={submitAttempted ? fieldErrors.extraPrints : undefined}
        />

        <Divider label="Manually printed outside the app" />
        <NumField
          label="System prints — PKR 500"
          value={form.systemPrints500}
          disabled={disabled}
          onChange={(v) => setField("systemPrints500", v)}
          error={submitAttempted ? fieldErrors.systemPrints500 : undefined}
        />
        <NumField
          label="System prints — PKR 250"
          value={form.systemPrints250}
          disabled={disabled}
          onChange={(v) => setField("systemPrints250", v)}
          error={submitAttempted ? fieldErrors.systemPrints250 : undefined}
        />

        <Divider label="Tracking only — doesn't affect money collected" />
        <NumField
          label="Free prints given"
          value={form.freePrints}
          disabled={disabled}
          onChange={(v) => setField("freePrints", v)}
          error={submitAttempted ? fieldErrors.freePrints : undefined}
        />
        <NumField
          label="Wasted prints"
          value={form.wastePrints}
          disabled={disabled}
          onChange={(v) => setField("wastePrints", v)}
          error={submitAttempted ? fieldErrors.wastePrints : undefined}
        />
      </Section>

      {/* ── Money Collected ──────────────────────────────────── */}
      <Section title="Money Collected">
        <MoneyField
          label="Cash received"
          value={form.cashReceived}
          disabled={disabled}
          onChange={(v) => setField("cashReceived", v)}
          error={submitAttempted ? fieldErrors.cashReceived : undefined}
        />
        <MoneyField
          label="Bank transfer received"
          value={form.bankReceived}
          disabled={disabled}
          onChange={(v) => setField("bankReceived", v)}
          error={submitAttempted ? fieldErrors.bankReceived : undefined}
        />
      </Section>

      {/* ── Operational Expenses ─────────────────────────────── */}
      <Section title="Operational Expenses">
        <p className="text-xs mb-3" style={{ color: "#8A9BAD" }}>
          Day-of costs — fuel, food, supplies. These come out of the day&apos;s
          money collected, not personal reimbursements.
        </p>

        {form.expenses.map((exp, i) => (
          <div key={i} className="flex gap-2 items-start mb-3">
            <div className="flex-1 space-y-2">
              <input
                type="text"
                placeholder="What was it for?"
                value={exp.description}
                disabled={disabled}
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
                  disabled={disabled}
                  onChange={(e) => setExpenseField(i, "amount", e.target.value)}
                  className="input-base w-full"
                />
              </div>
              {submitAttempted && expenseErrors[i] && (
                <p className="text-xs" style={{ color: "#C45A4A" }}>{expenseErrors[i]}</p>
              )}
            </div>
            {!disabled && form.expenses.length > 1 && (
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

        {!disabled && (
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
        )}
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
              style={{ color: summary.difference >= 0 ? "#4AC47A" : "#C45A4A" }}
            >
              {summary.difference >= 0 ? "+" : ""}
              {pkr(summary.difference)}
            </span>
          </div>
        </div>
      </Section>

      {/* ── Submit ──────────────────────────────────────────── */}
      {!disabled && (
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
          {submitting ? submittingLabel : submitLabel}
        </button>
      )}

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
        .input-base:disabled {
          opacity: 0.6;
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
    <div className="min-w-0">
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
  error,
  disabled,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div>
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
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="input-base w-24 text-right shrink-0"
          style={{ padding: "10px 12px", borderColor: error ? "#C45A4A" : undefined }}
        />
      </div>
      {error && (
        <p className="text-xs text-right mt-1" style={{ color: "#C45A4A" }}>{error}</p>
      )}
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
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
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="input-base flex-1"
          style={{ borderColor: error ? "#C45A4A" : undefined }}
        />
      </div>
      {error && (
        <p className="text-xs mt-1" style={{ color: "#C45A4A" }}>{error}</p>
      )}
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
