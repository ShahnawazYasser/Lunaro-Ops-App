"use client";

import { useState, useCallback, useEffect } from "react";
import BottomNav from "@/components/BottomNav";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import Badge from "@/components/Badge";
import Button from "@/components/Button";
import ConfirmDialog from "@/components/ConfirmDialog";
import EmptyState from "@/components/EmptyState";
import FormField, { InputStyles } from "@/components/FormField";
import SectionLabel from "@/components/SectionLabel";
import Sheet from "@/components/Sheet";
import Toast, { type ToastState } from "@/components/Toast";
import { formatDate } from "@/lib/dates";

interface Props {
  user: { id: string; name: string; role: string };
}

// Matches GET /api/users — never includes a PIN or hash.
interface UserRow {
  id: string;
  name: string;
  role: "employee" | "owner";
  active: boolean;
  must_set_pin: boolean;
  pin_changed_at: string | null;
}

function pinStatus(u: UserRow): string {
  if (u.must_set_pin || !u.pin_changed_at) return "Temporary PIN not yet changed";
  return `PIN last changed ${formatDate(u.pin_changed_at.slice(0, 10))}`;
}

function PinInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <FormField label="Temporary PIN (4 to 8 digits)" error={error}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        placeholder="e.g. 4827"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="input-base w-full"
      />
    </FormField>
  );
}

export default function UsersClient({ user }: Props) {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [resetFor, setResetFor] = useState<UserRow | null>(null);
  const [resetPin, setResetPin] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState<UserRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((type: ToastState["type"], message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/users");
        if (cancelled) return;
        if (res.ok) {
          const data = (await res.json()) as { items: UserRow[] };
          setRows(data.items);
          setListError(null);
        } else {
          const e = (await res.json()) as { error?: string };
          setListError(e.error ?? "Failed to load users");
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

  const patch = async (id: string, payload: Record<string, unknown>): Promise<{ ok: boolean; signedOutSelf?: boolean }> => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; signedOutSelf?: boolean } | null;
      if (!res.ok) {
        showToast("error", data?.error ?? "Something went wrong");
        return { ok: false };
      }
      return { ok: true, signedOutSelf: data?.signedOutSelf };
    } catch {
      showToast("error", "Could not reach server — check your connection");
      return { ok: false };
    } finally {
      setBusyId(null);
    }
  };

  const handleAdd = async () => {
    setAttempted(true);
    if (name.trim().length < 2 || pin.length < 4) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, pin }),
      });
      if (res.ok) {
        showToast("success", `${name.trim()} added. Tell them their temporary PIN in person.`);
        setName("");
        setPin("");
        setAttempted(false);
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

  const handleReset = async () => {
    if (!resetFor || resetPin.length < 4) return;
    const result = await patch(resetFor.id, { action: "reset_pin", pin: resetPin });
    if (!result.ok) return;
    const who = resetFor.name;
    setResetFor(null);
    setResetPin("");
    if (result.signedOutSelf) {
      window.location.href = "/login"; // your own sessions just ended — sign in with the new PIN
      return;
    }
    showToast("success", `New temporary PIN set for ${who}. Tell them in person.`);
    reload();
  };

  const handleDeactivate = async (u: UserRow) => {
    const result = await patch(u.id, { action: "deactivate" });
    setConfirmDeactivate(null);
    if (result.ok) {
      showToast("success", `${u.name} can no longer sign in`);
      reload();
    }
  };

  const handleReactivate = async (u: UserRow) => {
    const result = await patch(u.id, { action: "reactivate" });
    if (result.ok) {
      showToast("success", `${u.name} can sign in again`);
      reload();
    }
  };

  return (
    <div className="min-h-screen pb-24 bg-bg text-text">
      <PageHeader title="Users" />
      <Toast toast={toast} />

      {confirmDeactivate && (
        <ConfirmDialog
          title={`Deactivate ${confirmDeactivate.name}?`}
          message="They are signed out straight away and can't sign in again. Their entries and history stay. You can reactivate them later."
          confirmLabel="Deactivate"
          busy={busyId === confirmDeactivate.id}
          onConfirm={() => { void handleDeactivate(confirmDeactivate); }}
          onCancel={() => setConfirmDeactivate(null)}
        />
      )}

      {resetFor && (
        <Sheet title="Reset PIN" subtitle={resetFor.name} onClose={() => { setResetFor(null); setResetPin(""); }}>
          <Card>
            <div className="space-y-4">
              <p className="text-xs text-text-muted">
                Type a new temporary PIN and tell {resetFor.name} in person. They are signed out everywhere and
                must choose their own PIN next time.
                {resetFor.id === user.id ? " This is you — you'll be signed out now." : ""}
              </p>
              <PinInput value={resetPin} onChange={setResetPin} />
              <Button size="lg" className="w-full" disabled={busyId === resetFor.id || resetPin.length < 4}
                onClick={() => { void handleReset(); }}>
                {busyId === resetFor.id ? "Saving…" : "Set temporary PIN"}
              </Button>
            </div>
          </Card>
        </Sheet>
      )}

      <main className="max-w-lg mx-auto px-4 py-5 space-y-5">
        <p className="text-xs text-text-muted">
          Everyone signs in with their name and a PIN. When you add someone or reset a PIN, you give them a
          temporary one — they choose their own the first time they sign in. People are never deleted, so their
          entries and history stay.
        </p>

        <section>
          <SectionLabel>Add Staff</SectionLabel>
          <Card>
            <div className="space-y-4">
              <FormField label="Name (2 to 30 characters)"
                error={attempted && name.trim().length < 2 ? "Enter a name" : undefined}>
                <input type="text" placeholder="e.g. Amnah" maxLength={30} value={name}
                  onChange={(e) => setName(e.target.value)} className="input-base w-full" />
              </FormField>
              <PinInput value={pin} onChange={setPin}
                error={attempted && pin.length < 4 ? "Enter 4 to 8 digits" : undefined} />
              <Button size="lg" className="w-full" disabled={submitting} onClick={() => { void handleAdd(); }}>
                {submitting ? "Adding…" : "Add"}
              </Button>
            </div>
          </Card>
        </section>

        <section className="space-y-2">
          <SectionLabel>Everyone</SectionLabel>
          {listLoading ? (
            <EmptyState message="Loading…" />
          ) : listError ? (
            <EmptyState error message={listError} onRetry={reload} />
          ) : rows.length === 0 ? (
            <EmptyState message="No users yet" />
          ) : (
            rows.map((u) => (
              <Card key={u.id} size="sm" className={u.active ? "" : "opacity-60"}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium truncate text-text">{u.name}</p>
                      <Badge tone={u.role === "owner" ? "gold" : "muted"}>{u.role === "owner" ? "Owner" : "Staff"}</Badge>
                      {!u.active && <Badge tone="danger">Deactivated</Badge>}
                    </div>
                    <p className="text-xs mt-1 text-text-muted">{pinStatus(u)}</p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button variant="secondary" size="xs" disabled={busyId === u.id}
                      onClick={() => { setResetFor(u); setResetPin(""); }}>
                      Reset PIN
                    </Button>
                    {u.active ? (
                      u.id !== user.id && (
                        <Button variant="danger" size="xs" disabled={busyId === u.id}
                          onClick={() => setConfirmDeactivate(u)}>
                          Deactivate
                        </Button>
                      )
                    ) : (
                      <Button variant="secondary" size="xs" disabled={busyId === u.id}
                        onClick={() => { void handleReactivate(u); }}>
                        Reactivate
                      </Button>
                    )}
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
