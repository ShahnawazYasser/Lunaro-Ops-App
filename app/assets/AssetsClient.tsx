"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Button from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import FormField, { MoneyField, InputStyles } from "@/components/FormField";
import SectionLabel from "@/components/SectionLabel";
import Toast, { type ToastState } from "@/components/Toast";

// ── Types ──────────────────────────────────────────────────────────────────

interface Venue { id: string; name: string }

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
}

// Matches the SELECT in GET /api/assets.
interface AssetRow {
  id: string;
  name: string;
  cost: number;
  purchase_date: string;
  useful_life_months: number;
  salvage_value: number;
  venue_id: string | null;
  created_at: string;
  venues: { name: string } | null;
}

interface FormState {
  name: string;
  cost: string;
  purchaseDate: string;
  usefulLifeMonths: string;
  salvageValue: string;
  venueId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pkr(n: number) {
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

function blankForm(): FormState {
  return {
    name: "",
    cost: "",
    purchaseDate: localToday(),
    usefulLifeMonths: "",
    salvageValue: "",
    venueId: "",
  };
}

// Same math as the DB view's per-month amount: (cost - salvage) / useful_life_months.
function monthlyDepreciation(asset: AssetRow): number {
  return (asset.cost - asset.salvage_value) / asset.useful_life_months;
}

// Whole months elapsed since purchase, clamped to [0, useful_life_months].
function monthsElapsed(asset: AssetRow): number {
  const purchase = new Date(asset.purchase_date + "T00:00:00");
  const now = new Date();
  const months =
    (now.getFullYear() - purchase.getFullYear()) * 12 + (now.getMonth() - purchase.getMonth());
  return Math.max(0, Math.min(months, asset.useful_life_months));
}

function remainingMonths(asset: AssetRow): number {
  return asset.useful_life_months - monthsElapsed(asset);
}

// ── Main component ─────────────────────────────────────────────────────────

export default function AssetsClient({ user, venues }: Props) {
  const [form, setForm] = useState<FormState>(blankForm);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [rows, setRows] = useState<AssetRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [submitAttempted, setSubmitAttempted] = useState(false);
  const nameError = form.name.trim() === "" ? "Enter a name" : undefined;
  const costError = (() => {
    if (form.cost.trim() === "") return "Enter a cost";
    const n = Number(form.cost);
    if (n <= 0) return "Cost must be greater than 0";
    return undefined;
  })();
  const lifeError = (() => {
    if (form.usefulLifeMonths.trim() === "") return "Enter a useful life";
    const n = Number(form.usefulLifeMonths);
    if (!Number.isInteger(n) || n <= 0) return "Must be a whole number of months";
    return undefined;
  })();
  const salvageError = (() => {
    if (form.salvageValue.trim() === "") return undefined;
    const n = Number(form.salvageValue);
    if (n < 0) return "Can't be a negative number";
    if (form.cost.trim() !== "" && n >= Number(form.cost)) return "Must be less than the cost";
    return undefined;
  })();

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/assets");
      if (res.ok) {
        const data = (await res.json()) as { assets: AssetRow[] };
        setRows(data.assets);
      } else {
        const e = (await res.json()) as { error?: string };
        setListError(e.error ?? "Failed to load assets");
      }
    } catch {
      setListError("Could not reach server — check your connection");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (nameError || costError || lifeError || salvageError) {
      showToast("error", nameError ?? costError ?? lifeError ?? salvageError ?? "Fix the form and try again");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          cost: Number(form.cost),
          purchaseDate: form.purchaseDate,
          usefulLifeMonths: Number(form.usefulLifeMonths),
          salvageValue: form.salvageValue.trim() === "" ? 0 : Number(form.salvageValue),
          venueId: form.venueId || null,
        }),
      });

      if (res.ok) {
        showToast("success", "Asset added!");
        setForm(blankForm());
        setSubmitAttempted(false);
        void fetchList();
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

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        showToast("success", "Asset deleted");
      } else {
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Couldn't delete this asset");
      }
    } catch {
      showToast("error", "Could not reach server — check your connection");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const totalMonthlyDepreciation = rows.reduce(
    (s, a) => s + (remainingMonths(a) > 0 ? monthlyDepreciation(a) : 0),
    0
  );

  return (
    <div className="min-h-screen pb-24 bg-bg text-text">
      <PageHeader title="Assets" />
      <Toast toast={toast} />

      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete this asset?"
          message="This can't be undone. Its remaining monthly depreciation will stop counting immediately."
          busy={deletingId === confirmDeleteId}
          onConfirm={() => { void handleDelete(confirmDeleteId); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* ── Add Asset Form ─────────────────────────────────── */}
        <section>
          <SectionLabel>Add Asset</SectionLabel>
          <Card className="space-y-4">
            <FormField label="Name" error={submitAttempted ? nameError : undefined}>
              <input type="text" placeholder="e.g. Canon printer" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input-base w-full" />
            </FormField>

            <MoneyField label="Cost" value={form.cost}
              onChange={(v) => setForm((f) => ({ ...f, cost: v }))}
              error={submitAttempted ? costError : undefined} />

            <FormField label="Purchase date">
              <input type="date" value={form.purchaseDate}
                onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                className="input-base w-full" />
            </FormField>

            <FormField label="Useful life (months)" error={submitAttempted ? lifeError : undefined}>
              <input type="number" inputMode="numeric" placeholder="e.g. 12" min="1" step="1"
                value={form.usefulLifeMonths}
                onChange={(e) => setForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))}
                className="input-base w-full" />
            </FormField>

            <MoneyField label={<>Salvage value <span className="font-normal">(optional, default 0)</span></>}
              value={form.salvageValue}
              onChange={(v) => setForm((f) => ({ ...f, salvageValue: v }))}
              error={submitAttempted ? salvageError : undefined} />

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

            <Button size="lg" className="w-full" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving…" : "Add Asset"}
            </Button>
          </Card>
        </section>

        {/* ── List ─────────────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <SectionLabel className="">All Assets</SectionLabel>
            {rows.length > 0 && (
              <span className="text-xs text-text-muted">{pkr(totalMonthlyDepreciation)}/mo total</span>
            )}
          </div>

          {listLoading ? (
            <EmptyState message="Loading…" />
          ) : listError ? (
            <EmptyState error message={listError} onRetry={() => { void fetchList(); }} />
          ) : rows.length === 0 ? (
            <EmptyState message="No assets logged yet" />
          ) : (
            rows.map((asset) => {
              const remaining = remainingMonths(asset);
              const fullyDepreciated = remaining <= 0;

              return (
                <Card key={asset.id} size="sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate text-text">{asset.name}</p>
                        {asset.venues && <span className="text-xs text-text-muted">· {asset.venues.name}</span>}
                      </div>
                      <p className="text-xs mt-1 text-text-muted">
                        {pkr(asset.cost)} · bought{" "}
                        {new Date(asset.purchase_date + "T00:00:00").toLocaleDateString("en-PK", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                      <p className={`text-xs mt-1 ${fullyDepreciated ? "text-text-muted" : "text-gold"}`}>
                        {fullyDepreciated
                          ? "Fully depreciated"
                          : `${pkr(monthlyDepreciation(asset))}/mo · ${remaining} month${remaining === 1 ? "" : "s"} left`}
                      </p>
                    </div>
                    <Button variant="danger" size="xs" className="shrink-0" onClick={() => setConfirmDeleteId(asset.id)}>
                      Delete
                    </Button>
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
