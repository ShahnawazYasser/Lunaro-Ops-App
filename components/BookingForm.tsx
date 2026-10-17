"use client";

import { useState, useCallback } from "react";
import type { BookingStatus } from "@/lib/supabase/types";
import Button from "./Button";
import Card from "./Card";
import FormField, { MoneyField, InputStyles } from "./FormField";
import SectionLabel from "./SectionLabel";

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
        <FormField label="Client name">
          <input
            type="text"
            placeholder="e.g. Sana Malik"
            value={form.clientName}
            onChange={(e) => setField("clientName", e.target.value)}
            className="input-base w-full"
          />
        </FormField>
        <FormField label="Event name (optional)">
          <input
            type="text"
            placeholder="e.g. Mehndi"
            value={form.eventName}
            onChange={(e) => setField("eventName", e.target.value)}
            className="input-base w-full"
          />
        </FormField>
        <FormField label="Package (optional)">
          <input
            type="text"
            placeholder="e.g. 2-hour booth + props"
            value={form.package}
            onChange={(e) => setField("package", e.target.value)}
            className="input-base w-full"
          />
        </FormField>
        <MoneyField
          label="Amount charged"
          value={form.amountCharged}
          onChange={(v) => setField("amountCharged", v)}
        />
        <FormField label="Event date">
          <input
            type="date"
            value={form.eventDate}
            onChange={(e) => setField("eventDate", e.target.value)}
            className="input-base w-full"
          />
        </FormField>
        <FormField label="Notes (optional)">
          <input
            type="text"
            placeholder="Anything worth remembering"
            value={form.notes}
            onChange={(e) => setField("notes", e.target.value)}
            className="input-base w-full"
          />
        </FormField>
        {showFinalPayment && (
          <FormField label="Status">
            <select
              value={form.status}
              onChange={(e) => setField("status", e.target.value as BookingStatus)}
              className="input-base w-full"
            >
              <option value="upcoming">Upcoming</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </FormField>
        )}
      </Section>

      {/* ── Advance Received ─────────────────────────────────── */}
      <Section title="Advance Received">
        <p className="text-xs text-text-muted">
          Leave blank if nothing has been paid yet.
        </p>
        <MoneyField
          label="Amount"
          value={form.advanceAmount}
          onChange={setAdvanceAmount}
        />
        <FormField label="Date received">
          <input
            type="date"
            value={form.advanceDate}
            onChange={(e) => setField("advanceDate", e.target.value)}
            className="input-base w-full"
          />
        </FormField>
      </Section>

      {/* ── Final Payment (edit only) ────────────────────────── */}
      {showFinalPayment && (
        <Section title="Final Payment">
          <p className="text-xs text-text-muted">
            Leave blank until the rest is paid.
          </p>
          <MoneyField
            label="Amount"
            value={form.finalAmount}
            onChange={setFinalAmount}
          />
          <FormField label="Date received">
            <input
              type="date"
              value={form.finalDate}
              onChange={(e) => setField("finalDate", e.target.value)}
              className="input-base w-full"
            />
          </FormField>
        </Section>
      )}

      {/* ── Live Summary ─────────────────────────────────────── */}
      <Section title="Summary">
        <SummaryRow label="Amount charged" value={pkr(amountCharged)} />
        <SummaryRow label="Received so far" value={pkr(received)} />
        <div className="pt-3 mt-1 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-muted">Balance due</span>
            <span className={`text-base font-semibold ${balanceDue > 0 ? "text-gold" : "text-success"}`}>
              {balanceDue > 0 ? pkr(balanceDue) : "Fully paid"}
            </span>
          </div>
        </div>
      </Section>

      {/* ── Submit ──────────────────────────────────────────── */}
      <Button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-4! rounded-2xl! text-base!"
      >
        {submitting ? submittingLabel : submitLabel}
      </Button>

      <InputStyles />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionLabel>{title}</SectionLabel>
      <Card className="space-y-4">{children}</Card>
    </section>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-text-muted">{label}</span>
      <span className="text-sm font-semibold text-text">{value}</span>
    </div>
  );
}
