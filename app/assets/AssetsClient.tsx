"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";

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

interface Toast { type: "success" | "error"; message: string }

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
  const [toast, setToast] = useState<Toast | null>(null);

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

  const showToast = useCallback((type: Toast["type"], message: string) => {
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
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B1929", color: "#E8EFF5" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: "#0B1929", borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
        <span className="font-semibold" style={{ color: "#C9A84C" }}>Assets</span>
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
            <p className="text-sm font-medium">Delete this asset?</p>
            <p className="text-xs" style={{ color: "#8A9BAD" }}>
              This can&apos;t be undone. Its remaining monthly depreciation will stop counting immediately.
            </p>
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

        {/* ── Add Asset Form ─────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8A9BAD" }}>
            Add Asset
          </p>
          <div className="rounded-2xl p-4 space-y-4"
            style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>

            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Name</label>
              <input type="text" placeholder="e.g. Canon printer" value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="input-base w-full"
                style={{ borderColor: submitAttempted && nameError ? "#C45A4A" : undefined }} />
              {submitAttempted && nameError && (
                <p className="text-xs mt-1" style={{ color: "#C45A4A" }}>{nameError}</p>
              )}
            </div>

            {/* Cost */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Cost</label>
              <div className="flex items-center gap-2">
                <span className="text-sm shrink-0" style={{ color: "#8A9BAD" }}>PKR</span>
                <input type="number" inputMode="decimal" placeholder="0" min="0"
                  value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  className="input-base flex-1"
                  style={{ borderColor: submitAttempted && costError ? "#C45A4A" : undefined }} />
              </div>
              {submitAttempted && costError && (
                <p className="text-xs mt-1" style={{ color: "#C45A4A" }}>{costError}</p>
              )}
            </div>

            {/* Purchase date */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Purchase date</label>
              <input type="date" value={form.purchaseDate}
                onChange={(e) => setForm((f) => ({ ...f, purchaseDate: e.target.value }))}
                className="input-base w-full" />
            </div>

            {/* Useful life */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>Useful life (months)</label>
              <input type="number" inputMode="numeric" placeholder="e.g. 12" min="1" step="1"
                value={form.usefulLifeMonths}
                onChange={(e) => setForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))}
                className="input-base w-full"
                style={{ borderColor: submitAttempted && lifeError ? "#C45A4A" : undefined }} />
              {submitAttempted && lifeError && (
                <p className="text-xs mt-1" style={{ color: "#C45A4A" }}>{lifeError}</p>
              )}
            </div>

            {/* Salvage value */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#8A9BAD" }}>
                Salvage value <span className="font-normal">(optional, default 0)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm shrink-0" style={{ color: "#8A9BAD" }}>PKR</span>
                <input type="number" inputMode="decimal" placeholder="0" min="0"
                  value={form.salvageValue} onChange={(e) => setForm((f) => ({ ...f, salvageValue: e.target.value }))}
                  className="input-base flex-1"
                  style={{ borderColor: submitAttempted && salvageError ? "#C45A4A" : undefined }} />
              </div>
              {submitAttempted && salvageError && (
                <p className="text-xs mt-1" style={{ color: "#C45A4A" }}>{salvageError}</p>
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

            {/* Submit */}
            <button onClick={handleSubmit} disabled={submitting}
              className="w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity"
              style={{ backgroundColor: "#C9A84C", color: "#0B1929", opacity: submitting ? 0.65 : 1 }}>
              {submitting ? "Saving…" : "Add Asset"}
            </button>
          </div>
        </section>

        {/* ── List ─────────────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#8A9BAD" }}>
              All Assets
            </p>
            {rows.length > 0 && (
              <span className="text-xs" style={{ color: "#8A9BAD" }}>
                {pkr(totalMonthlyDepreciation)}/mo total
              </span>
            )}
          </div>

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
            <div className="text-center py-8 text-sm" style={{ color: "#8A9BAD" }}>No assets logged yet</div>
          ) : (
            rows.map((asset) => {
              const remaining = remainingMonths(asset);
              const fullyDepreciated = remaining <= 0;

              return (
                <div key={asset.id} className="rounded-xl p-3.5"
                  style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate" style={{ color: "#E8EFF5" }}>{asset.name}</p>
                        {asset.venues && (
                          <span className="text-xs" style={{ color: "#8A9BAD" }}>· {asset.venues.name}</span>
                        )}
                      </div>
                      <p className="text-xs mt-1" style={{ color: "#8A9BAD" }}>
                        {pkr(asset.cost)} · bought{" "}
                        {new Date(asset.purchase_date + "T00:00:00").toLocaleDateString("en-PK", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                      <p className="text-xs mt-1" style={{ color: fullyDepreciated ? "#8A9BAD" : "#C9A84C" }}>
                        {fullyDepreciated
                          ? "Fully depreciated"
                          : `${pkr(monthlyDepreciation(asset))}/mo · ${remaining} month${remaining === 1 ? "" : "s"} left`}
                      </p>
                    </div>
                    <button onClick={() => setConfirmDeleteId(asset.id)}
                      className="text-xs px-2 py-1 rounded-lg shrink-0"
                      style={{ color: "#C45A4A", border: "1px solid rgba(196,90,74,0.35)" }}>
                      Delete
                    </button>
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
