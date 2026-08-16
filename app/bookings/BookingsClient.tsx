"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
import BookingForm, {
  blankBookingValues,
  type BookingFormValues,
  type BookingPayload,
} from "@/components/BookingForm";
import type { BookingStatus } from "@/lib/supabase/types";

// ── Types ──────────────────────────────────────────────────────────────────

interface BookingRow {
  id: string;
  client_name: string;
  event_name: string | null;
  package: string | null;
  amount_charged: number;
  event_date: string;
  notes: string | null;
  advance_amount: number | null;
  advance_date: string | null;
  final_amount: number | null;
  final_date: string | null;
  status: BookingStatus;
  balance_due: number;
}

interface Toast {
  type: "success" | "error";
  message: string;
}

type ListFilter = "upcoming" | "past";

// ── Helpers ────────────────────────────────────────────────────────────────

function pkr(n: number): string {
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PK", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function rowToFormValues(row: BookingRow): BookingFormValues {
  return {
    clientName: row.client_name,
    eventName: row.event_name ?? "",
    package: row.package ?? "",
    amountCharged: String(row.amount_charged),
    eventDate: row.event_date,
    notes: row.notes ?? "",
    advanceAmount: row.advance_amount != null ? String(row.advance_amount) : "",
    advanceDate: row.advance_date ?? "",
    finalAmount: row.final_amount != null ? String(row.final_amount) : "",
    finalDate: row.final_date ?? "",
    status: row.status,
  };
}

function payloadToApiBody(payload: BookingPayload) {
  return {
    clientName: payload.clientName,
    eventName: payload.eventName,
    package: payload.package,
    amountCharged: payload.amountCharged,
    eventDate: payload.eventDate,
    notes: payload.notes,
    advanceAmount: payload.advanceAmount,
    advanceDate: payload.advanceDate,
  };
}

const STATUS_COLORS: Record<BookingStatus, { bg: string; text: string }> = {
  upcoming: { bg: "rgba(201,168,76,0.15)", text: "#C9A84C" },
  completed: { bg: "rgba(74,196,122,0.15)", text: "#4AC47A" },
  cancelled: { bg: "rgba(138,155,173,0.15)", text: "#8A9BAD" },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function BookingsClient({ user }: { user: { id: string; name: string; role: string } }) {
  const [filter, setFilter] = useState<ListFilter>("upcoming");
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<BookingRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((type: Toast["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchList = useCallback(async (f: ListFilter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bookings?filter=${f}`);
      if (res.ok) {
        const data = (await res.json()) as { bookings: BookingRow[] };
        setRows(data.bookings);
      } else {
        const e = (await res.json()) as { error?: string };
        setError(e.error ?? "Failed to load bookings");
      }
    } catch {
      setError("Could not reach server — check your connection");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchList(filter); }, [filter, fetchList]);

  const handleCreate = async (payload: BookingPayload) => {
    setCreating(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToApiBody(payload)),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        showToast("success", "Booking created");
        setFormKey((k) => k + 1);
        void fetchList(filter);
      } else {
        showToast("error", data.error ?? "Couldn't create the booking");
      }
    } catch {
      showToast("error", "Could not submit — check your connection");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async (row: BookingRow, payload: BookingPayload) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/bookings/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (res.ok) {
        setEditing(null);
        showToast("success", "Booking updated");
        void fetchList(filter);
      } else {
        showToast("error", data.error ?? "Couldn't save the changes");
      }
    } catch {
      showToast("error", "Could not save — check your connection");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (row: BookingRow) => {
    const prev = rows;
    setRows((r) => r.map((x) => (x.id === row.id ? { ...x, status: "cancelled" } : x)));
    try {
      const res = await fetch(`/api/bookings/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: row.client_name,
          eventName: row.event_name,
          package: row.package,
          amountCharged: row.amount_charged,
          eventDate: row.event_date,
          notes: row.notes,
          advanceAmount: row.advance_amount,
          advanceDate: row.advance_date,
          finalAmount: row.final_amount,
          finalDate: row.final_date,
          status: "cancelled",
        }),
      });
      if (!res.ok) {
        setRows(prev);
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Couldn't cancel the booking");
      } else {
        showToast("success", "Booking cancelled");
      }
    } catch {
      setRows(prev);
      showToast("error", "Could not reach server — check your connection");
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        showToast("success", "Booking deleted");
      } else {
        const e = (await res.json()) as { error?: string };
        showToast("error", e.error ?? "Couldn't delete this booking");
      }
    } catch {
      showToast("error", "Could not reach server — check your connection");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B1929", color: "#E8EFF5" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{ backgroundColor: "#0B1929", borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
        <span className="font-semibold" style={{ color: "#C9A84C" }}>Bookings</span>
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
            <p className="text-sm font-medium">Delete this booking?</p>
            <p className="text-xs" style={{ color: "#8A9BAD" }}>This can't be undone.</p>
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

      {/* Edit sheet */}
      {editing && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ backgroundColor: "#0B1929" }}>
          <header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3"
            style={{ backgroundColor: "#0B1929", borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
            <button onClick={() => setEditing(null)}
              className="text-sm px-3 py-1.5 rounded-lg shrink-0"
              style={{ color: "#8A9BAD", border: "1px solid rgba(200,212,224,0.15)" }}>
              Cancel
            </button>
            <div className="min-w-0 text-right">
              <p className="text-sm font-semibold truncate" style={{ color: "#C9A84C" }}>Edit booking</p>
              <p className="text-xs truncate" style={{ color: "#8A9BAD" }}>{editing.client_name}</p>
            </div>
          </header>
          <main className="max-w-lg mx-auto px-4 py-5 pb-16">
            <BookingForm
              initialValues={rowToFormValues(editing)}
              submitLabel="Save changes"
              submitting={saving}
              showFinalPayment
              onSubmit={(payload) => handleSaveEdit(editing, payload)}
              onError={(msg) => showToast("error", msg)}
            />
          </main>
        </div>
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* ── New booking form ─────────────────────────────────── */}
        <section>
          <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8A9BAD" }}>
            New Booking
          </p>
          <BookingForm
            key={formKey}
            initialValues={blankBookingValues()}
            submitLabel="Create Booking"
            submittingLabel="Creating…"
            submitting={creating}
            onSubmit={handleCreate}
            onError={(msg) => showToast("error", msg)}
          />
        </section>

        {/* ── List ─────────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex gap-2">
            <ToggleChip label="Upcoming" active={filter === "upcoming"} onClick={() => setFilter("upcoming")} />
            <ToggleChip label="Past" active={filter === "past"} onClick={() => setFilter("past")} />
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 rounded-full border-2 animate-spin"
                style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: "#C9A84C" }} />
            </div>
          ) : error ? (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm" style={{ color: "#C45A4A" }}>{error}</p>
              <button onClick={() => { void fetchList(filter); }}
                className="text-sm px-4 py-1.5 rounded-lg" style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.4)" }}>
                Try again
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{ color: "#8A9BAD" }}>
              No {filter} bookings
            </div>
          ) : (
            rows.map((row) => {
              const received = (row.advance_amount ?? 0) + (row.final_amount ?? 0);
              const cancelled = row.status === "cancelled";
              const statusColor = STATUS_COLORS[row.status];

              return (
                <div key={row.id} className="rounded-2xl p-4 space-y-3"
                  style={{
                    backgroundColor: "#16293D",
                    border: "1px solid rgba(200,212,224,0.10)",
                    opacity: cancelled ? 0.6 : 1,
                  }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "#C9A84C" }}>
                        {formatDate(row.event_date)}
                      </p>
                      <p className="text-sm font-medium mt-0.5 truncate">
                        {row.client_name}
                        {row.event_name && <span style={{ color: "#8A9BAD" }}> · {row.event_name}</span>}
                      </p>
                      {row.package && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: "#8A9BAD" }}>{row.package}</p>
                      )}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ backgroundColor: statusColor.bg, color: statusColor.text }}>
                      {row.status}
                    </span>
                  </div>

                  <p className="text-sm" style={{ color: "#E8EFF5" }}>
                    {pkr(row.amount_charged)} · received {pkr(received)} ·{" "}
                    {row.balance_due > 0 ? (
                      <span style={{ color: "#C9A84C", fontWeight: 600 }}>due {pkr(row.balance_due)}</span>
                    ) : (
                      <span style={{ color: "#4AC47A", fontWeight: 600 }}>Fully paid</span>
                    )}
                  </p>

                  {row.notes && (
                    <p className="text-xs" style={{ color: "#8A9BAD" }}>{row.notes}</p>
                  )}

                  <div className="flex gap-2 pt-1" style={{ borderTop: "1px solid rgba(200,212,224,0.08)" }}>
                    <button onClick={() => setEditing(row)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold mt-2"
                      style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
                      Edit
                    </button>
                    {!cancelled && (
                      <button onClick={() => { void handleCancel(row); }}
                        className="flex-1 py-2 rounded-lg text-xs font-medium mt-2"
                        style={{ color: "#8A9BAD", border: "1px solid rgba(200,212,224,0.15)" }}>
                        Cancel
                      </button>
                    )}
                    <button onClick={() => setConfirmDeleteId(row.id)}
                      className="flex-1 py-2 rounded-lg text-xs font-medium mt-2"
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
    </div>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
      style={{
        backgroundColor: active ? "rgba(201,168,76,0.15)" : "#16293D",
        color: active ? "#C9A84C" : "#8A9BAD",
        border: active ? "1px solid rgba(201,168,76,0.5)" : "1px solid rgba(200,212,224,0.10)",
      }}>
      {label}
    </button>
  );
}
