"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import EmptyState from "@/components/EmptyState";
import FormField, { MoneyField, InputStyles } from "@/components/FormField";
import SectionLabel from "@/components/SectionLabel";
import Sheet from "@/components/Sheet";
import Toast, { type ToastState } from "@/components/Toast";

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
  const [toast, setToast] = useState<ToastState | null>(null);

  const [rows, setRows] = useState<PayoutCycleRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);

  const today = localToday();

  const showToast = useCallback((type: ToastState["type"], message: string) => {
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
    <div className="min-h-screen pb-24 bg-bg text-text">
      <PageHeader title="Payouts" />
      <Toast toast={toast} />

      {editingId && editForm && (
        <Sheet title="Edit cycle" onClose={() => { setEditingId(null); setEditForm(null); }}>
          <div className="space-y-5">
            <section>
              <SectionLabel>Payout Details</SectionLabel>
              <Card className="space-y-4">
                <MoneyField label="Gross amount (optional)" value={editForm.grossAmount}
                  onChange={(v) => setEditForm((f) => f && { ...f, grossAmount: v })} />
                <MoneyField label="Rent deducted" value={editForm.rentDeducted}
                  onChange={(v) => setEditForm((f) => f && { ...f, rentDeducted: v })} />
                <FormField label="Payout date (once known)">
                  <input type="date" value={editForm.payoutDue}
                    onChange={(e) => setEditForm((f) => f && { ...f, payoutDue: e.target.value })}
                    className="input-base w-full" />
                </FormField>
              </Card>
            </section>

            <section>
              <SectionLabel>Mark Received</SectionLabel>
              <Card className="space-y-4">
                <p className="text-xs text-text-muted">
                  Leave both blank if this cycle&apos;s payout hasn&apos;t landed yet.
                </p>
                <FormField label="Date received">
                  <input type="date" value={editForm.receivedOn}
                    onChange={(e) => setEditForm((f) => f && { ...f, receivedOn: e.target.value })}
                    className="input-base w-full" />
                </FormField>
                <MoneyField label="Amount received" value={editForm.receivedAmount}
                  onChange={(v) => setEditForm((f) => f && { ...f, receivedAmount: v })} />
              </Card>
            </section>

            <Button size="lg" className="w-full" onClick={() => { void handleSaveEdit(); }} disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </Sheet>
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* ── Add cycle form ───────────────────────────────────── */}
        <section>
          <SectionLabel>Add Cycle</SectionLabel>
          <Card className="space-y-4">
            <FormField label="Venue">
              {venues.length === 0 ? (
                <p className="text-sm text-text-muted">No venues configured</p>
              ) : (
                <select value={form.venueId} onChange={(e) => setForm((f) => ({ ...f, venueId: e.target.value }))}
                  className="input-base w-full">
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Cycle start">
                <input type="date" value={form.cycleStart}
                  onChange={(e) => setForm((f) => ({ ...f, cycleStart: e.target.value }))}
                  className="input-base w-full" />
              </FormField>
              <FormField label="Cycle end">
                <input type="date" value={form.cycleEnd}
                  onChange={(e) => setForm((f) => ({ ...f, cycleEnd: e.target.value }))}
                  className="input-base w-full" />
              </FormField>
            </div>
            <MoneyField label="Gross amount (optional)" value={form.grossAmount}
              onChange={(v) => setForm((f) => ({ ...f, grossAmount: v }))} />
            <MoneyField label="Rent deducted (optional, default 0)" value={form.rentDeducted}
              onChange={(v) => setForm((f) => ({ ...f, rentDeducted: v }))} />
            <FormField label="Payout date (optional, once known)">
              <input type="date" value={form.payoutDue}
                onChange={(e) => setForm((f) => ({ ...f, payoutDue: e.target.value }))}
                className="input-base w-full" />
            </FormField>
            <Button size="lg" className="w-full" onClick={() => { void handleCreate(); }} disabled={submitting}>
              {submitting ? "Adding…" : "Add Cycle"}
            </Button>
          </Card>
        </section>

        {/* ── List ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <SectionLabel className="">All Cycles</SectionLabel>

          {listLoading ? (
            <EmptyState message="Loading…" />
          ) : listError ? (
            <EmptyState error message={listError} onRetry={() => { void fetchList(); }} />
          ) : rows.length === 0 ? (
            <EmptyState message="No payout cycles logged yet" />
          ) : (
            rows.map((row) => {
              const received = row.received_on != null;
              const overdue = !received && row.payout_due != null && row.payout_due < today;

              return (
                <Card key={row.id} className={`space-y-3 ${overdue ? "border-danger/50!" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate text-gold">{row.venues?.name ?? row.venue_id}</p>
                      <p className="text-xs mt-0.5 text-text-muted">
                        {formatDate(row.cycle_start)} – {formatDate(row.cycle_end)}
                      </p>
                    </div>
                    {received ? (
                      <Badge tone="success">Received</Badge>
                    ) : overdue ? (
                      <Badge tone="danger">Overdue</Badge>
                    ) : (
                      <Badge tone="muted">Awaiting</Badge>
                    )}
                  </div>

                  <div className="text-sm space-y-1 text-text">
                    <p>
                      Payout date:{" "}
                      <span className={overdue ? "text-danger font-semibold" : "text-text"}>
                        {row.payout_due ? formatDate(row.payout_due) : "Not set yet"}
                      </span>
                    </p>
                    {row.gross_amount != null && <p>Gross: {pkr(row.gross_amount)}</p>}
                    {row.rent_deducted > 0 && <p>Rent deducted: {pkr(row.rent_deducted)}</p>}
                    {received && (
                      <p className="text-success">
                        Received {pkr(row.received_amount ?? 0)} on {formatDate(row.received_on as string)}
                      </p>
                    )}
                  </div>

                  <Button variant="tint" size="sm" className="w-full" onClick={() => openEdit(row)}>
                    Edit
                  </Button>
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
