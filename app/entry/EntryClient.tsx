"use client";

import { useState, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
import ShiftEntryForm, {
  blankShiftEntryValues,
  type ShiftEntryPayload,
  type Venue,
} from "@/components/ShiftEntryForm";

interface Props {
  user: { id: string; name: string; role: string };
  venues: Venue[];
}

interface Toast {
  type: "success" | "error";
  message: string;
}

export default function EntryClient({ user, venues }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [lockedMessage, setLockedMessage] = useState<string | null>(null);
  // Bumped after a successful save — remounts the form back to a blank state.
  const [formKey, setFormKey] = useState(0);

  const showToast = useCallback((type: Toast["type"], message: string) => {
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
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B1929", color: "#E8EFF5" }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 py-3"
        style={{
          backgroundColor: "#0B1929",
          borderBottom: "1px solid rgba(200,212,224,0.12)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: "#C9A84C" }}>
            Lunaro Ops
          </span>
          <span className="text-sm" style={{ color: "#8A9BAD" }}>
            — {user.name}
          </span>
        </div>
      </header>

      {/* ── Toast ──────────────────────────────────────────────── */}
      {toast && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-xl text-sm font-medium shadow-xl"
          style={{
            backgroundColor: toast.type === "success" ? "#4AC47A" : "#C45A4A",
            color: "#fff",
          }}
        >
          {toast.message}
        </div>
      )}

      {/* ── Locked entry banner ──────────────────────────────────── */}
      {lockedMessage && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <div
            className="p-3.5 rounded-xl text-sm"
            style={{
              backgroundColor: "rgba(196,90,74,0.15)",
              color: "#C45A4A",
              border: "1px solid rgba(196,90,74,0.3)",
            }}
          >
            {lockedMessage}
          </div>
        </div>
      )}

      {/* ── Page title ─────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-2 max-w-lg mx-auto">
        <h1 className="text-xl font-semibold" style={{ color: "#E8EFF5" }}>
          Daily Entry
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "#8A9BAD" }}>
          Fill in your shift details below
        </p>
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
