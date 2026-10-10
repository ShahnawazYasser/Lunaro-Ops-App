"use client";

import { useState, useEffect, useCallback } from "react";
import BottomNav from "@/components/BottomNav";
import PageHeader from "@/components/PageHeader";
import MonthSwitcher from "@/components/MonthSwitcher";
import ErrorBanner from "@/components/ErrorBanner";
import Spinner from "@/components/Spinner";
import Card from "@/components/Card";
import StatCard from "@/components/StatCard";
import EmptyState from "@/components/EmptyState";
import SectionLabel from "@/components/SectionLabel";
import { RowList, Row } from "@/components/RowList";

// ── Types ──────────────────────────────────────────────────────────────────

interface VenueRevenue {
  venueId: string;
  venueName: string;
  revenue: number;
  shiftCount: number;
}

interface CategoryExpense {
  category: string;
  amount: number;
}

interface AttendanceSummaryRow {
  id: string;
  name: string;
  daysPresent: number;
}

interface RentCoverageItem {
  venueName: string;
  rentAmount: number;
  nextPayoutDue: string | null;
}

interface DashboardResponse {
  totalRevenue: number;
  operationalExpenses: number;
  reimbursements: number;
  totalExpenses: number;
  owedToEmployees: number;
  netProfit: number;
  freePrintsCount: number;
  freePrintsCost: number;
  wastePrints: number;
  bookingRevenue: number;
  bookingPaymentsCount: number;
  depreciation: number;
  revenueByVenue: VenueRevenue[];
  expensesByCategory: CategoryExpense[];
  attendance: AttendanceSummaryRow[];
  daysInMonth: number;
  rentCoverage: RentCoverageItem[];
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

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PK", {
    day: "numeric", month: "short", year: "numeric",
  });
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

  const hasActivity = !!data && (data.revenueByVenue.length > 0 || data.bookingRevenue > 0 || data.totalRevenue > 0 || data.totalExpenses > 0);

  return (
    <div className="min-h-screen pb-24 bg-bg text-text">
      <PageHeader title="Dashboard">
        <MonthSwitcher label={formatMonthLabel(month)} onPrev={() => setMonth(prevMonth)} onNext={() => setMonth(nextMonth)} />
      </PageHeader>

      {error && <ErrorBanner message={error} onRetry={() => { void fetchDashboard(month); }} />}

      {loading && <Spinner />}

      {!loading && data && (
        <main className="max-w-lg mx-auto px-4 py-5 space-y-5">

          {/* ── Net Profit ───────────────────────────────────────── */}
          <Card tone="gold" className="p-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest mb-1 text-gold">Net Profit</p>
            <p className={`text-3xl font-semibold ${data.netProfit >= 0 ? "text-gold" : "text-danger"}`}>
              {pkr(data.netProfit)}
            </p>
            <p className="text-xs mt-1 text-text-muted">Revenue − total expenses − depreciation</p>
          </Card>

          {/* ── Rent coverage warning ───────────────────────────── */}
          {data.rentCoverage.length > 0 && (
            <section className="space-y-2">
              {data.rentCoverage.map((item) => (
                <Card key={item.venueName} tone="danger" size="sm">
                  <p className="text-sm font-medium text-danger">
                    No {item.venueName} payout lands before rent is due this month.
                  </p>
                  <p className="text-xs mt-1 text-text-muted">
                    Rent: {pkr(item.rentAmount)}
                    {item.nextPayoutDue
                      ? ` · Next payout expected ${formatDate(item.nextPayoutDue)}`
                      : " · No payout date entered yet"}
                  </p>
                </Card>
              ))}
            </section>
          )}

          {!hasActivity && (
            <div className="text-center py-2 text-sm text-text-muted">No shift entries logged this month</div>
          )}

          {/* ── Stat cards ───────────────────────────────────────── */}
          <section className="grid grid-cols-2 gap-3">
            <StatCard label="Total Revenue" value={pkr(data.totalRevenue)} />
            <StatCard label="Total Expenses" value={pkr(data.totalExpenses)} />
            <StatCard label="Owed to Staff" value={pkr(data.owedToEmployees)} accent={data.owedToEmployees > 0} />
            <StatCard label="Free Prints Given" value={`${data.freePrintsCount}`} sub={pkr(data.freePrintsCost)} />
            <StatCard label="Waste Prints" value={`${data.wastePrints}`} />
          </section>

          {/* ── Revenue by venue ─────────────────────────────────── */}
          <section>
            <SectionLabel>Revenue by Venue</SectionLabel>
            {data.revenueByVenue.length === 0 && data.bookingRevenue === 0 ? (
              <Card size="list"><EmptyState message="No shifts logged this month" /></Card>
            ) : (
              <RowList>
                {data.revenueByVenue.map((v) => (
                  <Row
                    key={v.venueId}
                    title={v.venueName}
                    subtitle={`${v.shiftCount} ${v.shiftCount === 1 ? "shift" : "shifts"}`}
                    value={pkr(v.revenue)}
                  />
                ))}
                {data.bookingRevenue > 0 && (
                  <Row
                    title="Client events"
                    subtitle={`${data.bookingPaymentsCount} ${data.bookingPaymentsCount === 1 ? "payment" : "payments"} received`}
                    value={pkr(data.bookingRevenue)}
                  />
                )}
              </RowList>
            )}
          </section>

          {/* ── Expenses by category ─────────────────────────────── */}
          <section>
            <SectionLabel>Expenses by Category</SectionLabel>
            {data.expensesByCategory.length === 0 && data.depreciation === 0 ? (
              <Card size="list"><EmptyState message="No expenses logged this month" /></Card>
            ) : (
              <RowList>
                {data.expensesByCategory.map((c) => (
                  <Row key={c.category} title={c.category} value={pkr(c.amount)} tone="text" />
                ))}
                {data.depreciation > 0 && (
                  <Row
                    title="Depreciation"
                    subtitle="Non-cash — asset cost spread over time"
                    value={pkr(data.depreciation)}
                    tone="muted"
                    italic
                  />
                )}
              </RowList>
            )}
          </section>

          {/* ── Attendance summary ───────────────────────────────── */}
          <section>
            <SectionLabel>Attendance Summary</SectionLabel>
            {data.attendance.length === 0 ? (
              <Card size="list"><EmptyState message="No employees found" /></Card>
            ) : (
              <RowList>
                {data.attendance.map((emp) => (
                  <Row
                    key={emp.id}
                    title={emp.name}
                    tone="muted"
                    value={
                      <span className="font-normal">
                        <span className="font-semibold text-gold">{emp.daysPresent}</span> / {data.daysInMonth} days
                      </span>
                    }
                  />
                ))}
              </RowList>
            )}
          </section>
        </main>
      )}

      {!loading && !data && !error && <EmptyState message="No data" tall />}

      <BottomNav role="owner" />
    </div>
  );
}
