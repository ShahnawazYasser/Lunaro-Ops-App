"use client";

import { useState, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
import Card from "@/components/Card";
import PageHeader from "@/components/PageHeader";
import Toast, { type ToastState } from "@/components/Toast";
import ShiftEntryForm, {
  blankShiftEntryValues,
  type ShiftEntryPayload,
  type Venue,
} from "@/components/ShiftEntryForm";

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
}

export default function EntryClient({ user, venues }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  // Bumped after a successful save — remounts the form back to a blank state.
  const [formKey, setFormKey] = useState(0);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const handleSubmit = async (payload: ShiftEntryPayload) => {
    setLockedMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as { error?: string; updated?: boolean };

      if (res.ok) {
        showToast("success", data.updated ? "Shift updated!" : "Shift saved!");
        setFormKey((k) => k + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (res.status === 409) {
        setLockedMessage(
          data.error ?? "This entry has been finalized by the owner. Contact them to make changes."
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        showToast("error", data.error ?? "Something went wrong");
      }
    } catch {
      showToast("error", "Could not submit — check your connection");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen pb-24 bg-bg text-text">
      <PageHeader
        title="Lunaro Ops"
        right={<span className="text-sm text-text-muted">{user.name}</span>}
      />
      <Toast toast={toast} />

      {/* ── Locked entry banner ──────────────────────────────────── */}
      {lockedMessage && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <Card tone="danger" size="sm" className="text-sm text-danger">
            {lockedMessage}
          </Card>
        </div>
      )}

      {/* ── Page title ─────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-2 max-w-lg mx-auto">
        <h1 className="text-xl font-semibold text-text">Daily Entry</h1>
        <p className="text-sm mt-0.5 text-text-muted">Fill in your shift details below</p>
      </div>

      <main className="max-w-lg mx-auto px-4 pb-10">
        <ShiftEntryForm
          key={formKey}
          venues={venues}
          initialValues={blankShiftEntryValues()}
          submitLabel="Submit Shift"
          submitting={submitting}
          onSubmit={handleSubmit}
          onError={(msg) => showToast("error", msg)}
          onDateChange={() => setLockedMessage(null)}
        />
      </main>

      <BottomNav role={user.role} />
    </div>
  );
}
