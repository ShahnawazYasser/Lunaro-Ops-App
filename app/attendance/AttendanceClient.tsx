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
        <div className="mx-4 mt-4 p-3 rounded-xl text-sm" style={{ backgroundColor: "rgba(196,90,74,0.15)", color: "#C45A4A", border: "1px solid rgba(196,90,74,0.3)" }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 rounded-full border-2 animate-spin"
            style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: "#C9A84C" }} />
        </div>
      )}

      {/* Legend */}
      {!loading && data && (
        <div className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: "1px solid rgba(200,212,224,0.08)" }}>
          <LegendItem color="#4AC47A" label="Present" />
          <LegendItem color="#C45A4A" label="Absent" />
          <LegendItem color="#0B1929" label="—" borderGold label2="Edited" />
        </div>
      )}

      {/* Grid */}
      {!loading && data && (
        <main className="overflow-x-auto">
          <table style={{ minWidth: "max-content", borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                {/* Sticky name column header */}
                <th className="sticky left-0 z-10 text-left text-xs px-3 py-2"
                  style={{ backgroundColor: "#0B1929", color: "#8A9BAD", minWidth: 90, borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
                  Employee
                </th>
                {/* Day columns */}
                {data.employees[0]?.days.map((day) => (
                  <th key={day.date} className="text-center px-1 py-2"
                    style={{ minWidth: 38, color: "#8A9BAD", borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
                    <div className="text-[10px]">{dayOfWeek(day.date)}</div>
                    <div className="text-xs font-medium">{dayLabel(day.date)}</div>
                  </th>
                ))}
                {/* Summary column */}
                <th className="sticky right-0 z-10 text-center text-xs px-3 py-2"
                  style={{ backgroundColor: "#0B1929", color: "#8A9BAD", minWidth: 56, borderBottom: "1px solid rgba(200,212,224,0.12)", borderLeft: "1px solid rgba(200,212,224,0.12)" }}>
                  Days
                </th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((emp, i) => (
                <tr key={emp.id}>
                  {/* Employee name — sticky left */}
                  <td className="sticky left-0 z-10 px-3 py-2 text-sm font-medium"
                    style={{
                      backgroundColor: i % 2 === 0 ? "#0B1929" : "#16293D",
                      color: "#E8EFF5",
                      borderBottom: "1px solid rgba(200,212,224,0.08)",
                    }}>
                    {emp.name}
                  </td>

                  {/* Day cells */}
                  {emp.days.map((day) => {
                    const key = `${emp.id}-${day.date}`;
                    const isLoading = toggling === key;

                    let bg = "#0B1929";
                    if (day.status === "present") bg = "rgba(74,196,122,0.25)";
                    else if (day.status === "absent") bg = "rgba(196,90,74,0.25)";

                    const border = day.isOverridden
                      ? "1.5px solid rgba(201,168,76,0.7)"
                      : "1px solid rgba(200,212,224,0.06)";

                    return (
                      <td key={day.date} className="px-1 py-1.5 text-center"
                        style={{ borderBottom: "1px solid rgba(200,212,224,0.08)" }}>
                        <button
                          onClick={() => { void toggle(emp.id, day.date, day.status); }}
                          disabled={day.status === "future" || isLoading}
                          title={day.status === "future" ? "Future date" : `Toggle ${emp.name} on ${day.date}`}
                          className="w-7 h-7 rounded-lg flex items-center justify-center mx-auto transition-all"
                          style={{
                            backgroundColor: bg,
                            border,
                            cursor: day.status === "future" ? "default" : "pointer",
                            opacity: isLoading ? 0.5 : 1,
                          }}>
                          {isLoading ? (
                            <div className="w-3 h-3 rounded-full border animate-spin"
                              style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: "#C9A84C" }} />
                          ) : day.status === "present" ? (
                            <svg width="12" height="12" fill="none" stroke="#4AC47A" strokeWidth="2.5" viewBox="0 0 16 16">
                              <path d="M3 8l4 4 6-6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : day.status === "absent" ? (
                            <svg width="10" height="10" fill="none" stroke="#C45A4A" strokeWidth="2.5" viewBox="0 0 16 16">
                              <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                            </svg>
                          ) : null}
                        </button>
                      </td>
                    );
                  })}

                  {/* Summary — sticky right */}
                  <td className="sticky right-0 z-10 text-center px-3 py-2 text-sm font-semibold"
                    style={{
                      backgroundColor: i % 2 === 0 ? "#0B1929" : "#16293D",
                      color: "#C9A84C",
                      borderBottom: "1px solid rgba(200,212,224,0.08)",
                      borderLeft: "1px solid rgba(200,212,224,0.12)",
                    }}>
                    {countPresent(emp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Hint */}
          <p className="text-xs text-center py-4 px-4" style={{ color: "#8A9BAD" }}>
            Tap a cell to toggle present / absent · Gold border = manually edited
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

function LegendItem({ color, label, borderGold, label2 }: { color: string; label: string; borderGold?: boolean; label2?: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-4 h-4 rounded"
        style={{ backgroundColor: color, border: borderGold ? "1.5px solid rgba(201,168,76,0.7)" : "1px solid rgba(200,212,224,0.15)" }} />
      <span className="text-xs" style={{ color: "#8A9BAD" }}>{label2 ?? label}</span>
    </div>
  );
}
