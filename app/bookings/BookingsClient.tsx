"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge, { type BadgeTone } from "@/components/Badge";
import Button from "@/components/Button";
import Chip from "@/components/Chip";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import SectionLabel from "@/components/SectionLabel";
import Sheet from "@/components/Sheet";
import Spinner from "@/components/Spinner";
import Toast, { type ToastState } from "@/components/Toast";
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

const STATUS_TONES: Record<BookingStatus, BadgeTone> = {
  upcoming: "gold",
  completed: "success",
  cancelled: "muted",
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
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
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
    <div className="min-h-screen pb-24 bg-bg text-text">
      <PageHeader title="Bookings" />
      <Toast toast={toast} />

      {confirmDeleteId && (
        <ConfirmDialog
          title="Delete this booking?"
          message="This can't be undone."
          busy={deletingId === confirmDeleteId}
          onConfirm={() => { void handleDelete(confirmDeleteId); }}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

      {editing && (
        <Sheet title="Edit booking" subtitle={editing.client_name} onClose={() => setEditing(null)}>
          <BookingForm
            initialValues={rowToFormValues(editing)}
            submitLabel="Save changes"
            submitting={saving}
            showFinalPayment
            onSubmit={(payload) => handleSaveEdit(editing, payload)}
            onError={(msg) => showToast("error", msg)}
          />
        </Sheet>
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">

        {/* ── New booking form ─────────────────────────────────── */}
        <section>
          <SectionLabel>New Booking</SectionLabel>
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
            <Chip size="md" active={filter === "upcoming"} onClick={() => setFilter("upcoming")}>Upcoming</Chip>
            <Chip size="md" active={filter === "past"} onClick={() => setFilter("past")}>Past</Chip>
          </div>

          {loading ? (
            <Spinner />
          ) : error ? (
            <EmptyState error message={error} onRetry={() => { void fetchList(filter); }} />
          ) : rows.length === 0 ? (
            <EmptyState message={`No ${filter} bookings`} />
          ) : (
            rows.map((row) => {
              const received = (row.advance_amount ?? 0) + (row.final_amount ?? 0);
              const cancelled = row.status === "cancelled";

              return (
                <Card key={row.id} className="space-y-3" dim={cancelled}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gold">{formatDate(row.event_date)}</p>
                      <p className="text-sm font-medium mt-0.5 truncate">
                        {row.client_name}
                        {row.event_name && <span className="text-text-muted"> · {row.event_name}</span>}
                      </p>
                      {row.package && <p className="text-xs mt-0.5 truncate text-text-muted">{row.package}</p>}
                    </div>
                    <Badge tone={STATUS_TONES[row.status]}>{row.status}</Badge>
                  </div>

                  <p className="text-sm text-text">
                    {pkr(row.amount_charged)} · received {pkr(received)} ·{" "}
                    {row.balance_due > 0 ? (
                      <span className="text-gold font-semibold">due {pkr(row.balance_due)}</span>
                    ) : (
                      <span className="text-success font-semibold">Fully paid</span>
                    )}
                  </p>

                  {row.notes && <p className="text-xs text-text-muted">{row.notes}</p>}

                  <div className="flex gap-2 pt-1 border-t border-border/70">
                    <Button variant="tint" size="sm" className="flex-1 mt-2" onClick={() => setEditing(row)}>
                      Edit
                    </Button>
                    {!cancelled && (
                      <Button variant="secondary" size="sm" className="flex-1 mt-2" onClick={() => { void handleCancel(row); }}>
                        Cancel
                      </Button>
                    )}
                    <Button variant="danger" size="sm" className="flex-1 mt-2" onClick={() => setConfirmDeleteId(row.id)}>
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
    </div>
  );
}
