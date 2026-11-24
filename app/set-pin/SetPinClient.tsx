"use client";

import { useState } from "react";
import Link from "next/link";
import { cx } from "@/components/cx";

// Same keypad and look as the login screen.
const KEY_CLS =
  "py-5 rounded-2xl text-2xl transition-all active:scale-95 bg-surface border border-[rgba(200,212,224,0.10)]";
const MIN_PIN = 4;
const MAX_PIN = 8;
const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

type Step = "current" | "new" | "confirm";

export default function SetPinClient({ name, firstTime }: { name: string; firstTime: boolean }) {
  const [step, setStep] = useState<Step>(firstTime ? "new" : "current");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [pin, setPin] = useState(""); // what is being typed right now
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  const fail = (message: string) => {
    setError(message);
    setPin("");
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const title =
    step === "current" ? "Enter your current PIN" : step === "new" ? "Choose a new PIN" : "Type it again to confirm";

  const next = async () => {
    if (pin.length < MIN_PIN || loading) return;
    setError(null);

    if (step === "current") {
      setCurrentPin(pin);
      setPin("");
      setStep("new");
      return;
    }
    if (step === "new") {
      setNewPin(pin);
      setPin("");
      setStep("confirm");
      return;
    }

    // confirm
    if (pin !== newPin) {
      setNewPin("");
      setStep("new");
      fail("Those didn't match. Start again.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(firstTime ? { pin } : { pin, currentPin }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string; landing?: string } | null;
      if (res.ok) {
        window.location.href = data?.landing ?? "/";
        return;
      }
      // Back to the step that can fix it.
      setNewPin("");
      if (!firstTime && data?.error?.includes("current PIN")) {
        setCurrentPin("");
        setStep("current");
      } else {
        setStep("new");
      }
      fail(data?.error ?? "Something went wrong — try again");
    } catch {
      fail("Something went wrong — try again");
    } finally {
      setLoading(false);
    }
  };

  const digit = (d: string) => {
    if (loading || pin.length >= MAX_PIN) return;
    setPin(pin + d);
    setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-bg">
      <div className="w-full max-w-xs">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-gold">Lunaro Ops</h1>
          <p className="mt-1 text-sm text-text-muted">
            {firstTime ? `Welcome, ${name}. Choose your own PIN to continue.` : "Change your PIN"}
          </p>
        </div>

        <p className="text-center text-xs font-semibold uppercase tracking-widest mb-4 text-text-muted">{title}</p>

        <div className={cx("flex justify-center gap-3 mb-3", shake && "animate-shake")}>
          {Array.from({ length: Math.max(MIN_PIN, pin.length) }, (_, i) => i).map((i) => (
            <div
              key={i}
              className={cx(
                "w-4 h-4 rounded-full transition-all duration-150",
                i < pin.length ? "bg-gold scale-[1.15]" : "bg-[rgba(200,212,224,0.18)]",
              )}
            />
          ))}
        </div>

        <div className="min-h-6 text-center mb-4">
          {error ? (
            <p className="text-sm text-danger">{error}</p>
          ) : step === "new" ? (
            <p className="text-xs text-text-muted">4 to 8 digits. Not 1234, 0000 or other easy guesses.</p>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {DIGITS.map((d) => (
            <button key={d} onClick={() => digit(d)} disabled={loading || pin.length >= MAX_PIN}
              className={`${KEY_CLS} text-text font-medium disabled:opacity-40`}>
              {d}
            </button>
          ))}
          <button onClick={() => { if (!loading) { setPin((p) => p.slice(0, -1)); setError(null); } }}
            disabled={loading || pin.length === 0}
            className={`${KEY_CLS} text-text-muted disabled:opacity-30`}>
            ⌫
          </button>
          <button onClick={() => digit("0")} disabled={loading || pin.length >= MAX_PIN}
            className={`${KEY_CLS} text-text font-medium disabled:opacity-40`}>
            0
          </button>
          <div className="flex items-center justify-center">
            {loading && <div className="w-6 h-6 rounded-full border-2 animate-spin border-gold border-t-transparent" />}
          </div>
        </div>

        <button onClick={() => void next()} disabled={loading || pin.length < MIN_PIN}
          className="w-full mt-5 py-4 rounded-2xl text-lg font-semibold bg-gold text-bg transition-all active:scale-[0.98] disabled:opacity-40">
          {step === "confirm" ? "Save PIN" : "Next"}
        </button>

        {!firstTime && (
          <Link href="/" className="block text-center mt-4 text-sm text-text-muted">Cancel</Link>
        )}
      </div>
    </div>
  );
}
