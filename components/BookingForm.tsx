"use client";

import { useState, useCallback } from "react";
import type { BookingStatus } from "@/lib/supabase/types";

// ── Types ──────────────────────────────────────────────────────────────────

/** Every field of the booking form, as raw strings (input values). */
export interface BookingFormValues {
  clientName: string;
  eventName: string;
  package: string;
  amountCharged: string;
  eventDate: string;
  notes: string;
  advanceAmount: string;
  advanceDate: string;
  finalAmount: string;
  finalDate: string;
  status: BookingStatus;
}

/** Parsed, API-shaped payload handed to the submit handler. */
export interface BookingPayload {
  clientName: string;
  eventName: string | null;
  package: string | null;
  amountCharged: number;
  eventDate: string;
  notes: string | null;
  advanceAmount: number | null;
  advanceDate: string | null;
  finalAmount: number | null;
  finalDate: string | null;
  status: BookingStatus;
}

interface Props {
  initialValues: BookingFormValues;
  submitLabel: string;
  submittingLabel?: string;
  /** Parent-owned in-flight state — disables the submit button. */
  submitting: boolean;
  /** Edit mode only: reveals the Final Payment section and status picker. */
  showFinalPayment?: boolean;
  onSubmit: (payload: BookingPayload) => void | Promise<void>;
  /** Form-level validation messages the parent should surface (e.g. a toast). */
  onError: (message: string) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export function localToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function blankBookingValues(): BookingFormValues {
  return {
    clientName: "",
    eventName: "",
    package: "",
    amountCharged: "",
    eventDate: localToday(),
    notes: "",
    advanceAmount: "",
    advanceDate: "",
    finalAmount: "",
    finalDate: "",
    status: "upcoming",
  };
}

function parseNum(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function pkr(amount: number): string {
  return `PKR ${Math.round(amount).toLocaleString("en-PK")}`;
}

// ── Form ───────────────────────────────────────────────────────────────────

export default function BookingForm({
  initialValues,
  submitLabel,
  submittingLabel = "Saving…",
  submitting,
  showFinalPayment = false,
  onSubmit,
  onError,
}: Props) {
  const [form, setForm] = useState<BookingFormValues>(initialValues);

  const setField = useCallback(
    <K extends keyof BookingFormValues>(key: K, value: BookingFormValues[K]) => {
      setForm((f) => ({ ...f, [key]: value }));
    },
    []
  );

  // Typing an amount with no date yet auto-fills today — the common case
  // (money changes hands the day it's logged); the date stays editable.
  const setAdvanceAmount = (v: string) => {
    setForm((f) => ({
      ...f,
      advanceAmount: v,
      advanceDate: v.trim() && !f.advanceDate ? localToday() : f.advanceDate,
    }));
  };
  const setFinalAmount = (v: string) => {
    setForm((f) => ({
      ...f,
      finalAmount: v,
      finalDate: v.trim() && !f.finalDate ? localToday() : f.finalDate,
    }));
  };

  const amountCharged = parseNum(form.amountCharged);
  const advanceAmount = form.advanceAmount.trim() ? parseNum(form.advanceAmount) : 0;
  const finalAmount = showFinalPayment && form.finalAmount.trim() ? parseNum(form.finalAmount) : 0;
  const received = advanceAmount + finalAmount;
  const balanceDue = amountCharged - received;

  const handleSubmit = async () => {
    if (!form.clientName.trim()) {
      onError("Client name is required");
      return;
    }
    if (!form.amountCharged.trim() || amountCharged <= 0) {
      onError("Amount charged must be greater than 0");
      return;
    }
    if (!form.eventDate) {
      onError("Event date is required");
      return;
    }
    const hasAdvanceAmount = form.advanceAmount.trim() !== "";
    const hasAdvanceDate = !!form.advanceDate;
    if (hasAdvanceAmount !== hasAdvanceDate) {
      onError("Advance needs both an amount and a date, or leave both blank");
      return;
    }
    if (hasAdvanceAmount && advanceAmount <= 0) {
      onError("Advance amount must be greater than 0");
      return;
    }
    if (showFinalPayment) {
      const hasFinalAmount = form.finalAmount.trim() !== "";
      const hasFinalDate = !!form.finalDate;
      if (hasFinalAmount !== hasFinalDate) {
        onError("Final payment needs both an amount and a date, or leave both blank");
        return;
      }
      if (hasFinalAmount && finalAmount <= 0) {
        onError("Final payment amount must be greater than 0");
        return;
      }
    }
    if (received > amountCharged) {
      onError("Payments can't exceed the amount charged");
      return;
    }

    await onSubmit({
      clientName: form.clientName.trim(),
      eventName: form.eventName.trim() || null,
      package: form.package.trim() || null,
      amountCharged,
      eventDate: form.eventDate,
      notes: form.notes.trim() || null,
      advanceAmount: hasAdvanceAmount ? advanceAmount : null,
      advanceDate: hasAdvanceAmount ? form.advanceDate : null,
      finalAmount: showFinalPayment && form.finalAmount.trim() ? finalAmount : null,
      finalDate: showFinalPayment && form.finalAmount.trim() ? form.finalDate : null,
      status: form.status,
    });
  };

  return (
    <div className="space-y-5">
      {/* ── Event Details ────────────────────────────────────── */}
      <Section title="Event Details">
        <Field label="Client name">
          <input
            type="text"
            placeholder="e.g. Sana Malik"
            value={form.clientName}
            onChange={(e) => setField("clientName", e.target.value)}
            className="input-base w-full"
          />
        </Field>
        <Field label="Event name (optional)">
          <input
            type="text"
            placeholder="e.g. Mehndi"
            value={form.eventName}
            onChange={(e) => setField("eventName", e.target.value)}
            className="input-base w-full"
          />
        </Field>
        <Field label="Package (optional)">
          <input
            type="text"
            placeholder="e.g. 2-hour booth + props"
            value={form.package}
            onChange={(e) => setField("package", e.target.value)}
            className="input-base w-full"
          />
        </Field>
        <MoneyField
          label="Amount charged"
          value={form.amountCharged}
          onChange={(v) => setField("amountCharged", v)}
        />
        <Field label="Event date">
          <input
            type="date"
            value={form.eventDate}
            onChange={(e) => setField("eventDate", e.target.value)}
            className="input-base w-full"
          />
        </Field>
        <Field label="Notes (optional)">
          <input
            type="text"
            placeholder="Anything worth remembering"
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            className="input-base w-full"
          />
        </Field>
        {showFinalPayment && (
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) => setField("status", e.target.value as BookingStatus)}
              className="input-base w-full"
            >
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </Field>
        )}
      </Section>

      {/* ── Advance Received ─────────────────────────────────── */}
      <Section title="Advance Received">
        <p className="text-xs" style={{ color: "#8A9BAD" }}>
          Leave blank if nothing has been paid yet.
        </p>
        <MoneyField
          label="Amount"
          value={form.advanceAmount}
          onChange={setAdvanceAmount}
        />
        <Field label="Date received">
          <input
            type="date"
            value={form.advanceDate}
            onChange={(e) => setField("advanceDate", e.target.value)}
            className="input-base w-full"
          />
        </Field>
      </Section>

      {/* ── Final Payment (edit only) ────────────────────────── */}
      {showFinalPayment && (
        <Section title="Final Payment">
          <p className="text-xs" style={{ color: "#8A9BAD" }}>
            Leave blank until the rest is paid.
          </p>
          <MoneyField
            label="Amount"
            value={form.finalAmount}
            onChange={setFinalAmount}
          />
          <Field label="Date received">
            <input
              type="date"
              value={form.finalDate}
              onChange={(e) => setField("finalDate", e.target.value)}
              className="input-base w-full"
            />
          </Field>
        </Section>
      )}

      {/* ── Live Summary ─────────────────────────────────────── */}
      <Section title="Summary">
        <SummaryRow label="Amount charged" value={pkr(amountCharged)} />
        <SummaryRow label="Received so far" value={pkr(received)} />
        <div className="pt-3 mt-1" style={{ borderTop: "1px solid rgba(200,212,224,0.12)" }}>
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: "#8A9BAD" }}>Balance due</span>
            <span
              className="text-base font-semibold"
              style={{ color: balanceDue > 0 ? "#C9A84C" : "#4AC47A" }}
            >
              {balanceDue > 0 ? pkr(balanceDue) : "Fully paid"}
            </span>
          </div>
        </div>
      </Section>

      {/* ── Submit ──────────────────────────────────────────── */}
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-4 rounded-2xl text-base font-semibold transition-opacity"
        style={{ backgroundColor: "#C9A84C", color: "#0B1929", opacity: submitting ? 0.65 : 1 }}
      >
        {submitting ? submittingLabel : submitLabel}
      </button>

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
        .input-base:focus { border-color: rgba(201,168,76,0.5); }
        select.input-base option { background-color: #16293D; }
        input[type="date"] { color-scheme: dark; }
      `}</style>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8A9BAD" }}>
        {title}
      </p>
      <div className="rounded-2xl p-4 space-y-4" style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>
        {children}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>{label}</label>
      {children}
    </div>
  );
}

function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium shrink-0" style={{ color: "#8A9BAD" }}>PKR</span>
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
      <span className="text-sm" style={{ color: "#8A9BAD" }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: "#E8EFF5" }}>{value}</span>
    </div>
  );
}
