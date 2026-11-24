"use client";

import { useState } from "react";
import Button from "./Button";
import Card from "./Card";
import Chip from "./Chip";
import FormField, { MoneyField } from "./FormField";
import SectionLabel from "./SectionLabel";
import type { ToastState } from "./Toast";
import { CATEGORIES, EMPLOYEE_CATEGORIES, type Category, type EmployeeCategory } from "@/lib/categories";
import { todayInKarachi } from "@/lib/dates";
import { useReceiptUpload } from "@/lib/useReceiptUpload";

interface Venue { id: string; name: string }
interface Employee { id: string; name: string }

interface FormState {
  category: Category;
  amount: string;
  venueId: string;
  expenseDate: string;
  note: string;
  paidBy: "company" | "employee";
  payerUserId: string;
  relatedUserId: string;
}

interface ExpenseFormProps {
  /**
   * owner: full category list, Salary-for picker, "Who paid?" toggle.
   * employee: Petrol/Food/Transport/Misc grid; the API forces paid-by to themselves.
   */
  variant: "owner" | "employee";
  venues: Venue[];
  /** owner only — staff for the "Salary for" and "Who paid?" pickers */
  employees?: Employee[];
  onToast: (type: ToastState["type"], message: string) => void;
  /** called after a successful save, so the parent can refetch its list */
  onLogged: () => void;
}

function blankForm(variant: "owner" | "employee"): FormState {
  return {
    category: variant === "owner" ? "Operational" : "Petrol",
    amount: "",
    venueId: "",
    expenseDate: todayInKarachi(),
    note: "",
    paidBy: "company",
    payerUserId: "",
    relatedUserId: "",
  };
}

export default function ExpenseForm({ variant, venues, employees = [], onToast, onLogged }: ExpenseFormProps) {
  const owner = variant === "owner";
  const [form, setForm] = useState<FormState>(() => blankForm(variant));
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const { file: receiptFile, setFile: setReceiptFile, inputRef: receiptInputRef, uploading, upload: uploadReceipt, reset: resetReceipt } =
    useReceiptUpload();

  const amountError = (() => {
    if (form.amount.trim() === "") return "Enter an amount";
    const n = Number(form.amount);
    if (n < 0) return "Can't be a negative number";
    if (n <= 0) return "Enter an amount greater than 0";
    return undefined;
  })();
  const payerError = owner && form.paidBy === "employee" && !form.payerUserId ? "Pick who paid" : undefined;

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (amountError || payerError) {
      onToast("error", amountError ?? payerError ?? "Fix the form and try again");
      return;
    }

    setSubmitting(true);
    try {
      const up = await uploadReceipt();
      if (!up.ok) {
        onToast("error", up.error);
        return;
      }

      const body: Record<string, unknown> = {
        category: form.category,
        amount: Number(form.amount),
        venueId: form.venueId || null,
        expenseDate: form.expenseDate,
        description: form.note,
        receiptPath: up.path,
      };
      if (owner) {
        body.paidBy = form.paidBy;
        body.payerUserId = form.paidBy === "employee" ? form.payerUserId : null;
        body.relatedUserId = form.category === "Salary" && form.relatedUserId ? form.relatedUserId : null;
      }

      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        onToast("success", "Expense logged!");
        setForm(blankForm(variant));
        setSubmitAttempted(false);
        resetReceipt();
        onLogged();
      } else {
        const e = (await res.json()) as { error?: string };
        onToast("error", e.error ?? "Something went wrong");
      }
    } catch {
      onToast("error", "Could not submit — check your connection");
    } finally {
      setSubmitting(false);
    }
  };

  const venueField = (
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
  );

  const dateField = (
    <FormField label="Date">
      <input type="date" value={form.expenseDate}
        onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))}
        className="input-base w-full" />
    </FormField>
  );

  const amountField = (
    <MoneyField label="Amount" value={form.amount}
      onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
      error={submitAttempted ? amountError : undefined} />
  );

  return (
    <section>
      <SectionLabel>Log Expense</SectionLabel>
      <Card className="space-y-4">
        {owner ? (
          <>
            {dateField}

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

            {amountField}

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

            {venueField}

            <FormField label="Description">
              <input type="text" placeholder="e.g. August rent" value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="input-base w-full" />
            </FormField>
          </>
        ) : (
          <>
            <FormField label="Category">
              <div className="grid grid-cols-2 gap-2">
                {EMPLOYEE_CATEGORIES.map((cat: EmployeeCategory) => (
                  <Chip key={cat} size="md" active={form.category === cat}
                    onClick={() => setForm((f) => ({ ...f, category: cat }))}>
                    {cat}
                  </Chip>
                ))}
              </div>
            </FormField>

            {amountField}
            {venueField}
            {dateField}

            <FormField label="Note">
              <input type="text" placeholder="e.g. Fuel to Third Culture" value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                className="input-base w-full" />
            </FormField>
          </>
        )}

        <FormField label={<>Receipt photo <span className="font-normal">(optional)</span></>}>
          <input ref={receiptInputRef} type="file" accept="image/*,application/pdf"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium cursor-pointer text-text-muted bg-bg border border-[rgba(200,212,224,0.2)] rounded-[10px] px-3 py-2" />
          {receiptFile && <p className="text-xs mt-1 text-gold">{receiptFile.name}</p>}
        </FormField>

        <Button size="lg" className="w-full" onClick={handleSubmit} disabled={submitting || uploading}>
          {uploading ? "Uploading receipt…" : submitting ? "Saving…" : "Log Expense"}
        </Button>
      </Card>
    </section>
  );
}
