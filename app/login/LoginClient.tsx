"use client";

import { useState, useCallback } from "react";

const NAMES = ["Ahsan", "Farhan", "Owner"] as const;
type UserName = (typeof NAMES)[number];

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
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: "#0B1929" }}
    >
      <div className="w-full max-w-xs">
        {/* Header */}
        <div className="text-center mb-10">
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ color: "#C9A84C" }}
          >
            Lunaro Ops
          </h1>
          <p className="mt-1 text-sm" style={{ color: "#8A9BAD" }}>
            Internal staff tool
          </p>
        </div>

        {!selectedName ? (
          /* ── Step 1: Name selection ─────────────────────────── */
          <div>
            <p
              className="text-center text-xs font-semibold uppercase tracking-widest mb-4"
              style={{ color: "#8A9BAD" }}
            >
              Who are you?
            </p>
            <div className="space-y-3">
              {NAMES.map((name) => (
                <button
                  key={name}
                  onClick={() => handleNameSelect(name)}
                  className="w-full py-4 rounded-2xl text-lg font-medium transition-all active:scale-[0.98]"
                  style={{
                    backgroundColor: "#16293D",
                    color: "#E8EFF5",
                    border: "1px solid rgba(200,212,224,0.12)",
                  }}
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
            <button
              onClick={handleBack}
              className="flex items-center gap-1 text-sm mb-8"
              style={{ color: "#8A9BAD" }}
            >
              <span>←</span>
              <span>{selectedName}</span>
            </button>

            {/* PIN dots */}
            <div
              className="flex justify-center gap-5 mb-3"
              style={{
                animation: shake ? "shake 0.45s ease-in-out" : "none",
              }}
            >
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-full transition-all duration-150"
                  style={{
                    backgroundColor:
                      i < pin.length
                        ? "#C9A84C"
                        : "rgba(200,212,224,0.18)",
                    transform: i < pin.length ? "scale(1.15)" : "scale(1)",
                  }}
                />
              ))}
            </div>

            {/* Error */}
            <div className="h-6 text-center mb-4">
              {error && (
                <p className="text-sm" style={{ color: "#C45A4A" }}>
                  {error}
                </p>
              )}
            </div>

            {/* PIN pad */}
            <div className="grid grid-cols-3 gap-3">
              {DIGITS.map((d) => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  disabled={loading || pin.length >= 4}
                  className="py-5 rounded-2xl text-2xl font-medium transition-all active:scale-95 disabled:opacity-40"
                  style={{
                    backgroundColor: "#16293D",
                    color: "#E8EFF5",
                    border: "1px solid rgba(200,212,224,0.10)",
                  }}
                >
                  {d}
                </button>
              ))}

              {/* Backspace */}
              <button
                onClick={handleBackspace}
                disabled={loading || pin.length === 0}
                className="py-5 rounded-2xl text-2xl transition-all active:scale-95 disabled:opacity-30"
                style={{
                  backgroundColor: "#16293D",
                  color: "#8A9BAD",
                  border: "1px solid rgba(200,212,224,0.10)",
                }}
              >
                ⌫
              </button>

              {/* 0 */}
              <button
                onClick={() => handleDigit("0")}
                disabled={loading || pin.length >= 4}
                className="py-5 rounded-2xl text-2xl font-medium transition-all active:scale-95 disabled:opacity-40"
                style={{
                  backgroundColor: "#16293D",
                  color: "#E8EFF5",
                  border: "1px solid rgba(200,212,224,0.10)",
                }}
              >
                0
              </button>

              {/* Spinner placeholder */}
              <div className="flex items-center justify-center">
                {loading && (
                  <div
                    className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                    style={{
                      borderColor: "#C9A84C",
                      borderTopColor: "transparent",
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
