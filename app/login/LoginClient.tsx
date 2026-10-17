"use client";

import { useState, useCallback } from "react";
import { cx } from "@/components/cx";

const NAMES = ["Ahsan", "Farhan", "Owner"] as const;
type UserName = (typeof NAMES)[number];

// Shared look of every PIN-pad key
const KEY_CLS =
  "py-5 rounded-2xl text-2xl transition-all active:scale-95 bg-surface border border-[rgba(200,212,224,0.10)]";

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export default function LoginClient() {
  const [selectedName, setSelectedName] = useState<UserName | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const handleNameSelect = (name: UserName) => {
    setSelectedName(name);
    setPin("");
    setError(null);
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const submitPin = useCallback(
    async (fullPin: string) => {
      if (!selectedName) return;
      setLoading(true);
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: selectedName, pin: fullPin }),
        });

        if (res.ok) {
          // Hard redirect to "/" — middleware sends each role to its landing page
          window.location.href = "/";
        } else if (res.status === 429) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          triggerShake();
          setPin("");
          setError(data?.error ?? "Too many attempts. Wait 15 minutes and try again.");
        } else {
          triggerShake();
          setPin("");
          setError("Wrong PIN — try again");
        }
      } catch {
        setPin("");
        setError("Something went wrong — try again");
      } finally {
        setLoading(false);
      }
    },
    [selectedName]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (loading || !selectedName) return;
      const newPin = pin + digit;
      if (newPin.length > 4) return;
      setPin(newPin);
      setError(null);
      if (newPin.length === 4) {
        void submitPin(newPin);
      }
    },
    [pin, loading, selectedName, submitPin]
  );

  const handleBackspace = () => {
    if (loading) return;
    setPin((p) => p.slice(0, -1));
    setError(null);
  };

  const handleBack = () => {
    setSelectedName(null);
    setPin("");
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg">
      <div className="w-full max-w-xs">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-semibold tracking-tight text-gold">Lunaro Ops</h1>
          <p className="mt-1 text-sm text-text-muted">Internal staff tool</p>
        </div>

        {!selectedName ? (
          /* ── Step 1: Name selection ─────────────────────────── */
          <div>
            <p className="text-center text-xs font-semibold uppercase tracking-widest mb-4 text-text-muted">
              Who are you?
            </p>
            <div className="space-y-3">
              {NAMES.map((name) => (
                <button
                  key={name}
                  onClick={() => handleNameSelect(name)}
                  className="w-full py-4 rounded-2xl text-lg font-medium transition-all active:scale-[0.98] bg-surface text-text border border-border"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Step 2: PIN entry ──────────────────────────────── */
          <div>
            {/* Back link */}
            <button onClick={handleBack} className="flex items-center gap-1 text-sm mb-8 text-text-muted">
              <span>←</span>
              <span>{selectedName}</span>
            </button>

            {/* PIN dots */}
            <div className={cx("flex justify-center gap-5 mb-3", shake && "animate-shake")}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={cx(
                    "w-4 h-4 rounded-full transition-all duration-150",
                    i < pin.length ? "bg-gold scale-[1.15]" : "bg-[rgba(200,212,224,0.18)]",
                  )}
                />
              ))}
            </div>

            {/* Error */}
            <div className="h-6 text-center mb-4">
              {error && <p className="text-sm text-danger">{error}</p>}
            </div>

            {/* PIN pad */}
            <div className="grid grid-cols-3 gap-3">
              {DIGITS.map((d) => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  disabled={loading || pin.length >= 4}
                  className={`${KEY_CLS} text-text font-medium disabled:opacity-40`}
                >
                  {d}
                </button>
              ))}

              {/* Backspace */}
              <button
                onClick={handleBackspace}
                disabled={loading || pin.length === 0}
                className={`${KEY_CLS} text-text-muted disabled:opacity-30`}
              >
                ⌫
              </button>

              {/* 0 */}
              <button
                onClick={() => handleDigit("0")}
                disabled={loading || pin.length >= 4}
                className={`${KEY_CLS} text-text font-medium disabled:opacity-40`}
              >
                0
              </button>

              {/* Spinner placeholder */}
              <div className="flex items-center justify-center">
                {loading && (
                  <div className="w-6 h-6 rounded-full border-2 animate-spin border-gold border-t-transparent" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
