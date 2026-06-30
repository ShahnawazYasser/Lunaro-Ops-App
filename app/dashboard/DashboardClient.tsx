"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";

// ── Types ──────────────────────────────────────────────────────────────────

interface VenueRevenue {
  venueId: string;
  venueName: string;
  revenue: number;
  shiftCount: number;
}

interface AttendanceSummaryRow {
  id: string;
  name: string;
  daysPresent: number;
}

interface DashboardResponse {
  totalRevenue: number;
  operationalExpenses: number;
  reimbursements: number;
  netProfit: number;
  freePrintsCount: number;
  freePrintsCost: number;
  wastePrints: number;
  revenueByVenue: VenueRevenue[];
  attendance: AttendanceSummaryRow[];
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

function pkr(n: number): string {
  return `PKR ${Math.round(n).toLocaleString("en-PK")}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?month=${m}`);
      if (res.ok) {
        const d = (await res.json()) as DashboardResponse;
        setData(d);
      } else {
        const e = (await res.json()) as { error?: string };
        setError(e.error ?? "Failed to load dashboard");
      }
    } catch {
      setError("Could not reach server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchDashboard(month); }, [month, fetchDashboard]);

  const hasActivity = !!data && (data.revenueByVenue.length > 0 || data.totalRevenue > 0 || data.reimbursements > 0);

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B1929", color: "#E8EFF5" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 px-4 py-3"
        style={{ backgroundColor: "#0B1929", borderBottom: "1px solid rgba(200,212,224,0.12)" }}>
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold" style={{ color: "#C9A84C" }}>Dashboard</span>
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

      {!loading && data && (
        <main className="max-w-lg mx-auto px-4 py-5 space-y-5">

          {/* ── Net Profit ───────────────────────────────────────── */}
          <section className="rounded-2xl p-5 text-center"
            style={{ backgroundColor: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.3)" }}>
            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: "#C9A84C" }}>
              Net Profit
            </p>
            <p className="text-3xl font-semibold" style={{ color: data.netProfit >= 0 ? "#C9A84C" : "#C45A4A" }}>
              {pkr(data.netProfit)}
            </p>
            <p className="text-xs mt-1" style={{ color: "#8A9BAD" }}>
              Revenue − operational expenses − reimbursements
            </p>
          </section>

          {!hasActivity && (
            <div className="text-center py-2 text-sm" style={{ color: "#8A9BAD" }}>
              No shift entries logged this month
            </div>
          )}

          {/* ── Stat cards ───────────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-3">
            <StatCard label="Total Revenue" value={pkr(data.totalRevenue)} />
            <StatCard label="Operational Expenses" value={pkr(data.operationalExpenses)} />
            <StatCard label="Employee Reimbursements" value={pkr(data.reimbursements)} />
            <StatCard label="Free Prints Given" value={`${data.freePrintsCount}`} sub={pkr(data.freePrintsCost)} />
            <StatCard label="Waste Prints" value={`${data.wastePrints}`} />
          </section>

          {/* ── Revenue by venue ─────────────────────────────────── */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8A9BAD" }}>
              Revenue by Venue
            </p>
            <div className="rounded-2xl p-2" style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>
              {data.revenueByVenue.length === 0 ? (
                <div className="text-center py-6 text-sm" style={{ color: "#8A9BAD" }}>
                  No shifts logged this month
                </div>
              ) : (
                data.revenueByVenue.map((v, i) => (
                  <div key={v.venueId}
                    className="flex items-center justify-between px-3 py-2.5"
                    style={{ borderTop: i === 0 ? "none" : "1px solid rgba(200,212,224,0.08)" }}>
                    <div>
                      <p className="text-sm font-medium">{v.venueName}</p>
                      <p className="text-xs" style={{ color: "#8A9BAD" }}>
                        {v.shiftCount} {v.shiftCount === 1 ? "shift" : "shifts"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: "#C9A84C" }}>{pkr(v.revenue)}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* ── Attendance summary ───────────────────────────────── */}
          <section>
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "#8A9BAD" }}>
              Attendance Summary
            </p>
            <div className="rounded-2xl p-2" style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>
              {data.attendance.length === 0 ? (
                <div className="text-center py-6 text-sm" style={{ color: "#8A9BAD" }}>
                  No employees found
                </div>
              ) : (
                data.attendance.map((emp, i) => (
                  <div key={emp.id}
                    className="flex items-center justify-between px-3 py-2.5"
                    style={{ borderTop: i === 0 ? "none" : "1px solid rgba(200,212,224,0.08)" }}>
                    <p className="text-sm font-medium">{emp.name}</p>
                    <span className="text-sm" style={{ color: "#8A9BAD" }}>
                      <span className="font-semibold" style={{ color: "#C9A84C" }}>{emp.daysPresent}</span>
                      {" "}/ {data.daysInMonth} days
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
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

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl p-3.5" style={{ backgroundColor: "#16293D", border: "1px solid rgba(200,212,224,0.10)" }}>
      <p className="text-xs" style={{ color: "#8A9BAD" }}>{label}</p>
      <p className="text-lg font-semibold mt-0.5" style={{ color: "#E8EFF5" }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "#C9A84C" }}>{sub}</p>}
    </div>
  );
}
