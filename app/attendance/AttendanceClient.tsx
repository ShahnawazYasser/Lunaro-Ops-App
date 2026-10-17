"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
import PageHeader from "@/components/PageHeader";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import ErrorBanner from "@/components/ErrorBanner";
import MonthSwitcher from "@/components/MonthSwitcher";
import Spinner from "@/components/Spinner";
import { cx } from "@/components/cx";

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
    <div className="min-h-screen pb-24 bg-bg text-text">
      <PageHeader title="Attendance">
        <MonthSwitcher label={formatMonthLabel(month)}
          onPrev={() => setMonth(prevMonth)} onNext={() => setMonth(nextMonth)} />
      </PageHeader>

      {error && <ErrorBanner message={error} onRetry={() => { void fetchAttendance(month); }} />}

      {loading && <Spinner />}

      {/* Month summary + legend */}
      {!loading && data && (
        <div className="px-4 py-3 space-y-3 border-b border-[rgba(200,212,224,0.08)]">
          <div className="flex flex-wrap gap-3">
            {data.employees.map((emp) => (
              <Card key={emp.id} size="sm" className="flex-1 min-w-[120px] px-3! py-2!">
                <p className="text-xs text-text-muted">{emp.name}</p>
                <p className="text-sm font-semibold text-gold">
                  {countPresent(emp)} <span className="font-normal text-text-muted">/ {data.daysInMonth} days</span>
                </p>
              </Card>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <LegendItem swatch="bg-success/25" label="Present" />
            <LegendItem swatch="bg-danger/25" label="Absent" />
            <LegendItem swatch="bg-bg" borderGold label="Edited" />
          </div>
        </div>
      )}

      {/* Day-by-day list */}
      {!loading && data && (
        <main className="px-4 py-3 space-y-2">
          {dayRows.map((row) => (
            <Card key={row.date} size="sm" className="flex items-center justify-between gap-2 px-3! py-2.5!">
              <div className="shrink-0">
                <p className="text-xs text-text-muted">{dayOfWeek(row.date)}</p>
                <p className="text-sm font-medium">{dayLabel(row.date)}</p>
              </div>

              <div className="flex gap-2 flex-wrap justify-end">
                {row.entries.map((entry) => {
                  const key = `${entry.userId}-${entry.date}`;
                  const isLoading = toggling === key;
                  const isFuture = entry.status === "future";

                  const tone =
                    entry.status === "present" ? "bg-success/[0.18] text-success"
                    : entry.status === "absent" ? "bg-danger/[0.18] text-danger"
                    : "bg-bg text-text-muted";

                  return (
                    <button key={entry.userId}
                      onClick={() => { void toggle(entry.userId, entry.date, entry.status); }}
                      disabled={isFuture || isLoading}
                      title={isFuture ? "Future date" : `Toggle ${entry.name} on ${entry.date}`}
                      className={cx(
                        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all",
                        tone,
                        entry.isOverridden
                          ? "border-[1.5px] border-gold/70"
                          : "border border-[rgba(200,212,224,0.10)]",
                        isLoading && "opacity-50",
                        isFuture ? "cursor-default" : "cursor-pointer",
                      )}>
                      <span className="text-xs font-medium">{entry.name}</span>
                      {isLoading ? (
                        <div className="w-3 h-3 rounded-full border animate-spin border-gold/30 border-t-gold" />
                      ) : entry.status === "present" ? (
                        <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
                          <path d="M3 8l4 4 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : entry.status === "absent" ? (
                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 16 16">
                          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <span className="text-xs">—</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          ))}

          {/* Hint */}
          <p className="text-xs text-center pt-3 pb-1 text-text-muted">
            Tap a name to toggle present / absent · Gold border = manually edited
          </p>
        </main>
      )}

      {!loading && !data && !error && <EmptyState message="No data" tall />}

      <BottomNav role="owner" />
    </div>
  );
}

function LegendItem({ swatch, label, borderGold }: { swatch: string; label: string; borderGold?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cx(
        "w-4 h-4 rounded",
        swatch,
        borderGold ? "border-[1.5px] border-gold/70" : "border border-[rgba(200,212,224,0.15)]",
      )} />
      <span className="text-xs text-text-muted">{label}</span>
    </div>
  );
}
