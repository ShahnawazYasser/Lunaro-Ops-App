"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";

// ── Types ──────────────────────────────────────────────────────────────────

interface Venue { id: string; name: string }

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
}

// Matches the SELECT in GET /api/payouts.
interface PayoutCycleRow {
  id: string;
  venue_id: string;
  cycle_start: string;
  cycle_end: string;
  payout_due: string | null;
  gross_amount: number | null;
  rent_deducted: number;
  received_on: string | null;
  received_amount: number | null;
  venues: { name: string } | null;
}

interface NewCycleForm {
  venueId: string;
  cycleStart: string;
  cycleEnd: string;
  grossAmount: string;
  rentDeducted: string;
  payoutDue: string;
}

interface EditForm {
  grossAmount: string;
  rentDeducted: string;
  payoutDue: string;
  receivedOn: string;
  receivedAmount: string;
}

interface Toast { type: "success" | "error"; message: string }

// ── Helpers ────────────────────────────────────────────────────────────────

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pkr(n: number): string {
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PK", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function blankNewCycleForm(venues: Venue[]): NewCycleForm {
  return {
    venueId: venues[0]?.id ?? "",
    cycleStart: "",
    cycleEnd: "",
    grossAmount: "",
    rentDeducted: "",
    payoutDue: "",
  };
}

function rowToEditForm(row: PayoutCycleRow): EditForm {
  return {
    grossAmount: row.gross_amount != null ? String(row.gross_amount) : "",
    rentDeducted: String(row.rent_deducted),
    payoutDue: row.payout_due ?? "",
    receivedOn: row.received_on ?? "",
    receivedAmount: row.received_amount != null ? String(row.received_amount) : "",
  };
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PayoutsClient({ user, venues }: Props) {
  const [form, setForm] = useState<NewCycleForm>(() => blankNewCycleForm(venues));
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [rows, setRows] = useState<PayoutCycleRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const today = localToday();

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/api/payouts");
      if (res.ok) {
        const data = (await res.json()) as { cycles: PayoutCycleRow[] };
        setRows(data.cycles);
      } else {
        const e = (await res.json()) as { error?: string };
        setListError(e.error ?? "Failed to load payout cycles");
      }
    } catch {
      setListError("Could not reach server — check your connection");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { void fetchList(); }, [fetchList]);

  const handleCreate = async () => {
    if (!form.venueId) {
      showToast("error", "Choose a venue");
      return;
    }
    if (!form.cycleStart || !form.cycleEnd) {
      showToast("error", "Cycle start and end dates are required");
      return;
    }
    if (form.cycleEnd < form.cycleStart) {
      showToast("error", "Cycle end can't be before cycle start");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: form.venueId,
          cycleStart: form.cycleStart,
          cycleEnd: form.cycleEnd,
          grossAmount: form.grossAmount.trim() === "" ? null : Number(form.grossAmount),
          rentDeducted: form.rentDeducted.trim() === "" ? 0 : Number(form.rentDeducted),
          payoutDue: form.payoutDue.trim() === "" ? null : form.payoutDue,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        showToast("success", "Cycle added");
        setForm(blankNewCycleForm(venues));
        void fetchList();
      } else {
        showToast("error", data.error ?? "Couldn't add the cycle");
      }
    } catch {
      showToast("error", "Could not submit — check your connection");
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (row: PayoutCycleRow) => {
    setEditingId(row.id);
    setEditForm(rowToEditForm(row));
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm) return;

    const hasReceivedOn = editForm.receivedOn.trim() !== "";
    const hasReceivedAmount = editForm.receivedAmount.trim() !== "";
    if (hasReceivedOn !== hasReceivedAmount) {
      showToast("error", "Mark received needs both a date and an amount, or clear both");
      return;
    }
    if (hasReceivedAmount && Number(editForm.receivedAmount) <= 0) {
      showToast("error", "Received amount must be greater than 0");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/payouts/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grossAmount: editForm.grossAmount.trim() === "" ? null : Number(editForm.grossAmount),
          rentDeducted: editForm.rentDeducted.trim() === "" ? 0 : Number(editForm.rentDeducted),
          payoutDue: editForm.payoutDue.trim() === "" ? null : editForm.payoutDue,
          receivedOn: hasReceivedOn ? editForm.receivedOn : null,
          receivedAmount: hasReceivedAmount ? Number(editForm.receivedAmount) : null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        showToast("success", "Cycle updated");
        setEditingId(null);
        setEditForm(null);
        void fetchList();
      } else {
        showToast("error", data.error ?? "Couldn't save the changes");
      }
    } catch {
      showToast("error", "Could not save — check your connection");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B1929", color: "#E8EFF5" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: "#0B1929", borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
        <span className="font-semibold" style={{ color: "#C9A84C" }}>Payouts</span>
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

      {/* Edit sheet */}
      {editingId && editForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: "#0B1929" }}>
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3"
            style={{ backgroundColor: "#0B1929", borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
            <button onClick={() => { setEditingId(null); setEditForm(null); }}
              className="text-sm px-3 py-1.5 rounded-lg shrink-0"
              style={{ color: "#8A9BAD", border: "1px solid rgba(200,212,224,0.15)" }}>
              Cancel
            </button>
            <p className="text-sm font-semibold" style={{ color: "#C9A84C" }}>Edit cycle</p>
          </header>
          <main className="max-w-lg mx-auto px-4 py-5 pb-16 space-y-5">
            <Section title="Payout Details">
              <MoneyField label="Gross amount (optional)" value={editForm.grossAmount}
                onChange={(v) => setEditForm((f) => f && { ...f, grossAmount: v })} />
              <MoneyField label="Rent deducted" value={editForm.rentDeducted}
                onChange={(v) => setEditForm((f) => f && { ...f, rentDeducted: v })} />
              <Field label="Payout date (once known)">
                <input type="date" value={editForm.payoutDue}
                  onChange={(e) => setEditForm((f) => f && { ...f, payoutDue: e.target.value })}
                  className="input-base w-full" />
              </Field>
            </Section>

            <Section title="Mark Received">
              <p className="text-xs" style={{ color: "#8A9BAD" }}>
                Leave both blank if this cycle's payout hasn&apos;t landed yet.
              </p>
              <Field label="Date received">
                <input type="date" value={editForm.receivedOn}
                  onChange={(e) => setEditForm((f) => f && { ...f, receivedOn: e.target.value })}
                  className="input-base w-full" />
              </Field>
              <MoneyField label="Amount received" value={editForm.receivedAmount}
                onChange={(v) => setEditForm((f) => f && { ...f, receivedAmount: v })} />
            </Section>

            <button onClick={() => { void handleSaveEdit(); }} disabled={saving}
              className="w-full py-4 rounded-2xl text-base font-semibold transition-opacity"
              style={{ backgroundColor: "#C9A84C", color: "#0B1929", opacity: saving ? 0.65 : 1 }}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </main>
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* ── Add cycle form ───────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8A9BAD" }}>
            Add Cycle
          </p>
          <div className="rounded-2xl p-4 space-y-4"
            style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>
            <Field label="Venue">
              {venues.length === 0 ? (
                <p className="text-sm" style={{ color: "#8A9BAD" }}>No venues configured</p>
              ) : (
                <select value={form.venueId} onChange={(e) => setForm((f) => ({ ...f, venueId: e.target.value }))}
                  className="input-base w-full">
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cycle start">
                <input type="date" value={form.cycleStart}
                  onChange={(e) => setForm((f) => ({ ...f, cycleStart: e.target.value }))}
                  className="input-base w-full" />
              </Field>
              <Field label="Cycle end">
                <input type="date" value={form.cycleEnd}
                  onChange={(e) => setForm((f) => ({ ...f, cycleEnd: e.target.value }))}
                  className="input-base w-full" />
              </Field>
            </div>
            <MoneyField label="Gross amount (optional)" value={form.grossAmount}
              onChange={(v) => setForm((f) => ({ ...f, grossAmount: v }))} />
            <MoneyField label="Rent deducted (optional, default 0)" value={form.rentDeducted}
              onChange={(v) => setForm((f) => ({ ...f, rentDeducted: v }))} />
            <Field label="Payout date (optional, once known)">
              <input type="date" value={form.payoutDue}
                onChange={(e) => setForm((f) => ({ ...f, payoutDue: e.target.value }))}
                className="input-base w-full" />
            </Field>
            <button onClick={() => { void handleCreate(); }} disabled={submitting}
              className="w-full py-3.5 rounded-xl text-sm font-semibold transition-opacity"
              style={{ backgroundColor: "#C9A84C", color: "#0B1929", opacity: submitting ? 0.65 : 1 }}>
              {submitting ? "Adding…" : "Add Cycle"}
            </button>
          </div>
        </section>

        {/* ── List ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#8A9BAD" }}>
            All Cycles
          </p>

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
            <div className="text-center py-8 text-sm" style={{ color: "#8A9BAD" }}>No payout cycles logged yet</div>
          ) : (
            rows.map((row) => {
              const received = row.received_on != null;
              const overdue = !received && row.payout_due != null && row.payout_due < today;

              return (
                <div key={row.id} className="rounded-2xl p-4 space-y-3"
                  style={{
                    backgroundColor: "#16293D",
                    border: overdue ? "1px solid rgba(196,90,74,0.5)" : "1px solid rgba(200,212,224,0.10)",
                  }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "#C9A84C" }}>
                        {row.venues?.name ?? row.venue_id}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "#8A9BAD" }}>
                        {formatDate(row.cycle_start)} – {formatDate(row.cycle_end)}
                      </p>
                    </div>
                    {received ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                        style={{ backgroundColor: "rgba(74,196,122,0.15)", color: "#4AC47A" }}>
                        Received
                      </span>
                    ) : overdue ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                        style={{ backgroundColor: "rgba(196,90,74,0.18)", color: "#C45A4A" }}>
                        Overdue
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                        style={{ backgroundColor: "rgba(200,212,224,0.10)", color: "#8A9BAD" }}>
                        Awaiting
                      </span>
                    )}
                  </div>

                  <div className="text-sm space-y-1" style={{ color: "#E8EFF5" }}>
                    <p>
                      Payout date:{" "}
                      <span style={{ color: overdue ? "#C45A4A" : "#E8EFF5", fontWeight: overdue ? 600 : 400 }}>
                        {row.payout_due ? formatDate(row.payout_due) : "Not set yet"}
                      </span>
                    </p>
                    {row.gross_amount != null && <p>Gross: {pkr(row.gross_amount)}</p>}
                    {row.rent_deducted > 0 && <p>Rent deducted: {pkr(row.rent_deducted)}</p>}
                    {received && (
                      <p style={{ color: "#4AC47A" }}>
                        Received {pkr(row.received_amount ?? 0)} on {formatDate(row.received_on as string)}
                      </p>
                    )}
                  </div>

                  <button onClick={() => openEdit(row)}
                    className="w-full py-2 rounded-lg text-xs font-semibold"
                    style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
                    Edit
                  </button>
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
        <input type="number" inputMode="decimal" placeholder="0" min="0" value={value}
          onChange={(e) => onChange(e.target.value)} className="input-base flex-1" />
      </div>
    </Field>
  );
}
