"use client";

import { useState, useCallback, useEffect } from "react";
import BottomNav from "@/components/BottomNav";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import FormField, { MoneyField, InputStyles } from "@/components/FormField";
import SectionLabel from "@/components/SectionLabel";
import Sheet from "@/components/Sheet";
import Toast, { type ToastState } from "@/components/Toast";
import { CATEGORIES, type Category } from "@/lib/categories";

// ── Types ──────────────────────────────────────────────────────────────────

interface Venue { id: string; name: string }

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
}

// Matches the SELECT in GET /api/recurring.
interface RecurringRow {
  id: string;
  name: string;
  category: string;
  amount: number;
  due_day: number;
  venue_id: string | null;
  active: boolean;
  venues: { name: string } | null;
}

interface FormState {
  name: string;
  category: Category;
  amount: string;
  dueDay: string;
  venueId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pkr(n: number) {
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

function blankForm(): FormState {
  return { name: "", category: "Rent", amount: "", dueDay: "1", venueId: "" };
}

function formFromRow(r: RecurringRow): FormState {
  return {
    name: r.name,
    category: (CATEGORIES as readonly string[]).includes(r.category) ? (r.category as Category) : "Misc",
    amount: String(r.amount),
    dueDay: String(r.due_day),
    venueId: r.venue_id ?? "",
  };
}

function validate(f: FormState) {
  const amount = Number(f.amount);
  const day = Number(f.dueDay);
  return {
    name: f.name.trim() === "" ? "Enter a name" : undefined,
    amount:
      f.amount.trim() === "" ? "Enter an amount" : amount <= 0 ? "Amount must be greater than 0" : undefined,
    dueDay:
      f.dueDay.trim() === ""
        ? "Enter a day"
        : !Number.isInteger(day) || day < 1 || day > 28
          ? "Pick a day from 1 to 28"
          : undefined,
  };
}

function toBody(f: FormState) {
  return {
    name: f.name,
    category: f.category,
    amount: Number(f.amount),
    dueDay: Number(f.dueDay),
    venueId: f.venueId || null,
  };
}

// ── Shared form (add card + edit sheet) ────────────────────────────────────

function RecurringForm({
  initial,
  venues,
  submitLabel,
  submittingLabel,
  submitting,
  onSubmit,
}: {
  initial: FormState;
  venues: Venue[];
  submitLabel: string;
  submittingLabel: string;
  submitting: boolean;
  onSubmit: (form: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [attempted, setAttempted] = useState(false);
  const errors = validate(form);

  return (
    <div className="space-y-4">
      <FormField label="Name" error={attempted ? errors.name : undefined}>
        <input type="text" placeholder="e.g. Lanes rent" value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="input-base w-full" />
      </FormField>

      <FormField label="Category">
        <select value={form.category}
          onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
          className="input-base w-full">
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </FormField>

      <MoneyField label="Amount per month" value={form.amount}
        onChange={(v) => setForm((f) => ({ ...f, amount: v }))}
        error={attempted ? errors.amount : undefined} />

      <FormField label="Usually around day of the month" error={attempted ? errors.dueDay : undefined}>
        <input type="number" inputMode="numeric" min="1" max="28" step="1" value={form.dueDay}
          onChange={(e) => setForm((f) => ({ ...f, dueDay: e.target.value }))}
          className="input-base w-full" />
      </FormField>

      <FormField label="Venue (optional)">
        {venues.length === 0 ? (
          <p className="text-sm text-text-muted">No venues configured</p>
        ) : (
          <select value={form.venueId}
            onChange={(e) => setForm((f) => ({ ...f, venueId: e.target.value }))}
            className="input-base w-full">
            <option value="">— None —</option>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        )}
      </FormField>

      <Button size="lg" className="w-full" disabled={submitting}
        onClick={() => {
          setAttempted(true);
          if (errors.name || errors.amount || errors.dueDay) return;
          onSubmit(form);
        }}>
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function RecurringClient({ user, venues }: Props) {
  const [rows, setRows] = useState<RecurringRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [addKey, setAddKey] = useState(0); // remounts the add form to clear it
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<RecurringRow | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/recurring");
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { items: RecurringRow[] };
          setRows(data.items);
          setListError(null);
        } else {
          const e = (await res.json()) as { error?: string };
          setListError(e.error ?? "Failed to load recurring costs");
        }
      } catch {
        if (!cancelled) setListError("Could not reach server — check your connection");
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadTick]);

  const reload = () => {
    setListLoading(true);
    setListError(null);
    setReloadTick((t) => t + 1);
  };

  const handleCreate = async (form: FormState) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBody(form)),
      });
      if (res.ok) {
        showToast("success", "Recurring cost added!");
        setAddKey((k) => k + 1);
        reload();
      } else {
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Something went wrong");
      }
    } catch {
      showToast("error", "Could not submit — check your connection");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (id: string, form: FormState) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/recurring/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBody(form)),
      });
      if (res.ok) {
        showToast("success", "Saved");
        setEditing(null);
        reload();
      } else {
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Something went wrong");
      }
    } catch {
      showToast("error", "Could not save — check your connection");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (row: RecurringRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/recurring/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      if (res.ok) {
        showToast("success", row.active ? "Paused" : "Resumed");
        reload();
      } else {
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Something went wrong");
      }
    } catch {
      showToast("error", "Could not reach server — check your connection");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/recurring/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        showToast("success", "Deleted");
      } else {
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Couldn't delete this");
      }
    } catch {
      showToast("error", "Could not reach server — check your connection");
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  };

  const activeTotal = rows.filter((r) => r.active).reduce((s, r) => s + r.amount, 0);

  return (
    <div className="min-h-screen pb-24 bg-bg text-text">
      <PageHeader title="Recurring Costs" />
      <Toast toast={toast} />

      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete this recurring cost?"
          message="This can't be undone. Past expenses you've already logged aren't affected."
          busy={busyId === confirmDeleteId}
          onConfirm={() => { void handleDelete(confirmDeleteId); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {editing && (
        <Sheet title="Edit recurring cost" subtitle={editing.name} onClose={() => setEditing(null)}>
          <Card>
            <RecurringForm
              key={editing.id}
              initial={formFromRow(editing)}
              venues={venues}
              submitLabel="Save Changes"
              submittingLabel="Saving…"
              submitting={submitting}
              onSubmit={(f) => { void handleEdit(editing.id, f); }}
            />
          </Card>
        </Sheet>
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        <p className="text-xs text-text-muted">
          Costs that come back every month, like rent. A rent linked to a venue powers the
          &ldquo;rent not covered&rdquo; warning on the dashboard. This list doesn&apos;t log expenses
          by itself — log them on the Expenses screen as usual.
        </p>

        {/* ── Add ───────────────────────────────────────────── */}
        <section>
          <SectionLabel>Add Recurring Cost</SectionLabel>
          <Card>
            <RecurringForm
              key={addKey}
              initial={blankForm()}
              venues={venues}
              submitLabel="Add"
              submittingLabel="Saving…"
              submitting={submitting}
              onSubmit={(f) => { void handleCreate(f); }}
            />
          </Card>
        </section>

        {/* ── List ──────────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <SectionLabel className="">All Recurring Costs</SectionLabel>
            {rows.length > 0 && (
              <span className="text-xs text-text-muted">{pkr(activeTotal)}/mo active</span>
            )}
          </div>

          {listLoading ? (
            <EmptyState message="Loading…" />
          ) : listError ? (
            <EmptyState error message={listError} onRetry={reload} />
          ) : rows.length === 0 ? (
            <EmptyState message="No recurring costs yet" />
          ) : (
            rows.map((r) => (
              <Card key={r.id} size="sm" className={r.active ? "" : "opacity-60"}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate text-text">{r.name}</p>
                      {!r.active && <Badge tone="muted">Paused</Badge>}
                    </div>
                    <p className="text-xs mt-1 text-text-muted">
                      {r.category}
                      {r.venues ? ` · ${r.venues.name}` : ""} · around day {r.due_day}
                    </p>
                    <p className="text-sm mt-1 text-gold">{pkr(r.amount)}/mo</p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button variant="secondary" size="xs" disabled={busyId === r.id}
                      onClick={() => setEditing(r)}>
                      Edit
                    </Button>
                    <Button variant="secondary" size="xs" disabled={busyId === r.id}
                      onClick={() => { void handleToggleActive(r); }}>
                      {r.active ? "Pause" : "Resume"}
                    </Button>
                    <Button variant="danger" size="xs" onClick={() => setConfirmDeleteId(r.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </section>
      </main>

      <BottomNav role={user.role} />
      <InputStyles />
    </div>
  );
}
