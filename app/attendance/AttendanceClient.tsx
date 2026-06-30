"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";

// ── Types ──────────────────────────────────────────────────────────────────

interface DayStatus {
  date: string;     // YYYY-MM-DD
  status: "present" | "absent" | "future";
  isOverridden: boolean;
}

interface EmployeeAttendance {
  id: string;
  name: string;
  days: DayStatus[];
}

interface AttendanceResponse {
  employees: EmployeeAttendance[];
  daysInMonth: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString("en-PK", {
    month: "long", year: "numeric",
  });
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return String(d.getDate());
}

function dayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()];
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AttendanceClient({ ownerId }: { ownerId: string }) {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<AttendanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null); // "userId-date"
  const [error, setError] = useState<string | null>(null);

  const fetchAttendance = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/attendance?month=${m}`);
      if (res.ok) {
        const d = (await res.json()) as AttendanceResponse;
        setData(d);
      } else {
        const e = (await res.json()) as { error?: string };
        setError(e.error ?? "Failed to load attendance");
      }
    } catch {
      setError("Could not reach server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAttendance(month); }, [month, fetchAttendance]);

  const toggle = async (userId: string, date: string, currentStatus: "present" | "absent" | "future") => {
    if (currentStatus === "future") return;

    const key = `${userId}-${date}`;
    setToggling(key);

    const newIsPresent = currentStatus !== "present";

    try {
      const res = await fetch("/api/attendance/override", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, date, setPresent: newIsPresent }),
      });

      if (res.ok) {
        // Optimistically update the local state
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            employees: prev.employees.map((emp) => {
              if (emp.id !== userId) return emp;
              return {
                ...emp,
                days: emp.days.map((day) => {
                  if (day.date !== date) return day;
                  return {
                    ...day,
                    status: newIsPresent ? "present" : "absent",
                    isOverridden: true,
                  };
                }),
              };
            }),
          };
        });
      } else {
        const e = (await res.json()) as { error?: string };
        setError(e.error ?? "Override failed");
      }
    } catch {
      setError("Could not save — check connection");
    } finally {
      setToggling(null);
    }
  };

  // Count summaries per employee for the displayed month
  function countPresent(emp: EmployeeAttendance): number {
    return emp.days.filter((d) => d.status === "present").length;
  }

  // Pivot from per-employee → per-day rows (newest day first) for the mobile list
  const dayRows = data
    ? (data.employees[0]?.days ?? [])
        .map((_, idx) => ({
          date: data.employees[0].days[idx].date,
          entries: data.employees.map((emp) => ({
            userId: emp.id,
            name: emp.name,
            ...emp.days[idx],
          })),
        }))
        .slice()
        .reverse()
    : [];

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B1929", color: "#E8EFF5" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 px-4 py-3"
        style={{ backgroundColor: "#0B1929", borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold" style={{ color: "#C9A84C" }}>Attendance</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>
            Owner
          </span>
        </div>

        {/* Month switcher */}
        <div className="flex items-center justify-between">
          <button onClick={() => setMonth(prevMonth)}
            className="px-4 py-1.5 rounded-lg text-sm"
            style={{ color: "#8A9BAD", border: "1px solid rgba(200,212,224,0.15)" }}>
            ←
          </button>
          <span className="text-sm font-medium">{formatMonthLabel(month)}</span>
          <button onClick={() => setMonth(nextMonth)}
            className="px-4 py-1.5 rounded-lg text-sm"
            style={{ color: "#8A9BAD", border: "1px solid rgba(200,212,224,0.15)" }}>
            →
          </button>
        </div>
      </header>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-4 p-3 rounded-xl text-sm flex items-center justify-between gap-3" style={{ backgroundColor: "rgba(196,90,74,0.15)", color: "#C45A4A", border: "1px solid rgba(196,90,74,0.3)" }}>
          <span>{error}</span>
          <button onClick={() => { void fetchAttendance(month); }}
            className="shrink-0 text-xs px-3 py-1 rounded-lg" style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.4)" }}>
            Try again
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: "#C9A84C" }} />
        </div>
      )}

      {/* Month summary + legend */}
      {!loading && data && (
        <div className="px-4 py-3 space-y-3" style={{ borderBottom: "1px solid rgba(200,212,224,0.08)" }}>
          <div className="flex flex-wrap gap-3">
            {data.employees.map((emp) => (
              <div key={emp.id} className="flex-1 min-w-[120px] rounded-xl px-3 py-2"
                style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>
                <p className="text-xs" style={{ color: "#8A9BAD" }}>{emp.name}</p>
                <p className="text-sm font-semibold" style={{ color: "#C9A84C" }}>
                  {countPresent(emp)} <span className="font-normal" style={{ color: "#8A9BAD" }}>/ {data.daysInMonth} days</span>
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <LegendItem color="rgba(74,196,122,0.25)" label="Present" />
            <LegendItem color="rgba(196,90,74,0.25)" label="Absent" />
            <LegendItem color="#0B1929" borderGold label="Edited" />
          </div>
        </div>
      )}

      {/* Day-by-day list */}
      {!loading && data && (
        <main className="px-4 py-3 space-y-2">
          {dayRows.map((row) => (
            <div key={row.date} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2.5"
              style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>
              <div className="shrink-0">
                <p className="text-xs" style={{ color: "#8A9BAD" }}>{dayOfWeek(row.date)}</p>
                <p className="text-sm font-medium">{dayLabel(row.date)}</p>
              </div>

              <div className="flex gap-2 flex-wrap justify-end">
                {row.entries.map((entry) => {
                  const key = `${entry.userId}-${entry.date}`;
                  const isLoading = toggling === key;
                  const isFuture = entry.status === "future";

                  let bg = "#0B1929";
                  let textColor = "#8A9BAD";
                  if (entry.status === "present") { bg = "rgba(74,196,122,0.18)"; textColor = "#4AC47A"; }
                  else if (entry.status === "absent") { bg = "rgba(196,90,74,0.18)"; textColor = "#C45A4A"; }

                  const border = entry.isOverridden
                    ? "1.5px solid rgba(201,168,76,0.7)"
                    : "1px solid rgba(200,212,224,0.10)";

                  return (
                    <button key={entry.userId}
                      onClick={() => { void toggle(entry.userId, entry.date, entry.status); }}
                      disabled={isFuture || isLoading}
                      title={isFuture ? "Future date" : `Toggle ${entry.name} on ${entry.date}`}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all"
                      style={{ backgroundColor: bg, border, opacity: isLoading ? 0.5 : 1, cursor: isFuture ? "default" : "pointer" }}>
                      <span className="text-xs font-medium" style={{ color: isFuture ? "#8A9BAD" : textColor }}>
                        {entry.name}
                      </span>
                      {isLoading ? (
                        <div className="w-3 h-3 rounded-full border animate-spin"
                          style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: "#C9A84C" }} />
                      ) : entry.status === "present" ? (
                        <svg width="12" height="12" fill="none" stroke="#4AC47A" strokeWidth="2.5" viewBox="0 0 16 16">
                          <path d="M3 8l4 4 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : entry.status === "absent" ? (
                        <svg width="10" height="10" fill="none" stroke="#C45A4A" strokeWidth="2.5" viewBox="0 0 16 16">
                          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <span className="text-xs" style={{ color: "#8A9BAD" }}>—</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Hint */}
          <p className="text-xs text-center pt-3 pb-1" style={{ color: "#8A9BAD" }}>
            Tap a name to toggle present / absent · Gold border = manually edited
          </p>
        </main>
      )}

      {!loading && !data && !error && (
        <div className="text-center py-16 text-sm" style={{ color: "#8A9BAD" }}>
          No data
        </div>
      )}

      <BottomNav role="owner" />
    </div>
  );
}

function LegendItem({ color, label, borderGold }: { color: string; label: string; borderGold?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-4 h-4 rounded"
        style={{ backgroundColor: color, border: borderGold ? "1.5px solid rgba(201,168,76,0.7)" : "1px solid rgba(200,212,224,0.15)" }} />
      <span className="text-xs" style={{ color: "#8A9BAD" }}>{label}</span>
    </div>
  );
}
