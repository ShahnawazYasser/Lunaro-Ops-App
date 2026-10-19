"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { cx } from "@/components/cx";

// ── Types ──────────────────────────────────────────────────────────────────

interface VenueRevenue {
  venueId: string;
  venueName: string;
  revenue: number;
  shiftCount: number;
  payoutCycles: number;
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

interface DailyRevenue {
  date: string;
  amount: number;
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
  payoutRevenue: number;
  payoutRent: number;
  payoutCyclesPaid: number;
  depreciation: number;
  revenueByVenue: VenueRevenue[];
  expensesByCategory: CategoryExpense[];
  attendance: AttendanceSummaryRow[];
  daysInMonth: number;
  rentCoverage: RentCoverageItem[];
  dailyRevenue: DailyRevenue[];
}

// Per-day attendance comes from the existing /api/attendance route (same
// derivation as the Attendance screen) — the dashboard API only has counts.
interface AttendanceDay {
  date: string;
  status: "present" | "absent" | "future";
}
interface EmployeeAttendance {
  id: string;
  name: string;
  days: AttendanceDay[];
}

interface MonthData {
  dashboard: DashboardResponse;
  attendance: EmployeeAttendance[] | null;
}

// Month results kept for the session so switching back to a month shows it
// instantly (then quietly refreshes) instead of flashing an empty hero.
const monthCache = new Map<string, MonthData>();

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

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ── Small building blocks ──────────────────────────────────────────────────

function Glass({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("glass rounded-[20px]", className)}>{children}</section>;
}

function Skel({ className }: { className?: string }) {
  return <div className={cx("rounded-xl bg-surface-inset", className)} />;
}

function LMark({ className }: { className?: string }) {
  return (
    <div
      className={cx("flex shrink-0 items-center justify-center font-display font-bold text-bg-deep", className)}
      style={{ background: "var(--gradient-gold)" }}
    >
      L
    </div>
  );
}

function PhotoStrip({ small }: { small?: boolean }) {
  return (
    <div
      className={cx("flex shrink-0 flex-col rounded-xl", small ? "gap-1.5 p-1.5" : "gap-2 p-2.5")}
      style={{ background: "var(--gradient-gold)" }}
      aria-hidden="true"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={cx(
            "flex items-center justify-center rounded-[4px] bg-bg-deep",
            small ? "h-10 w-14" : "h-[62px] w-[88px]",
          )}
        >
          <div className={cx("rounded-full bg-gold-light", small ? "h-4 w-4" : "h-7 w-7")} />
        </div>
      ))}
    </div>
  );
}

function MonthPill({ label, onPrev, onNext }: { label: string; onPrev: () => void; onNext: () => void }) {
  const btn =
    "flex h-10 w-10 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-full bg-surface-inset text-text transition-colors duration-150 hover:bg-surface-raised";
  return (
    <div className="glass flex w-full items-center justify-between rounded-full p-1.5 lg:w-[280px]">
      <button className={btn} onClick={onPrev} aria-label="Previous month">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <span className="text-sm font-semibold">{label}</span>
      <button className={btn} onClick={onNext} aria-label="Next month">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
  );
}

interface BarRow {
  label: string;
  sub?: string;
  amount: number;
  muted?: boolean;
}

function BarList({ title, rows, footnote, fill }: { title: string; rows: BarRow[]; footnote?: string; fill: "gold" | "raised" }) {
  const max = Math.max(1, ...rows.map((r) => r.amount));
  return (
    <Glass className="p-5 lg:p-6">
      <h2 className="mb-4 text-base font-semibold leading-[22px]">{title}</h2>
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className={cx("truncate text-sm font-medium", r.muted && "text-text-muted")}>{r.label}</p>
                {r.sub && <p className="truncate text-xs text-text-muted">{r.sub}</p>}
              </div>
              <p className={cx("shrink-0 text-sm font-semibold", r.muted && "text-text-muted")}>{pkr(r.amount)}</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-inset">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(r.amount / max) * 100}%`,
                  background: fill === "gold" ? "var(--gradient-gold)" : "var(--color-surface-raised)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
      {footnote && <p className="mt-4 text-xs text-text-muted">{footnote}</p>}
    </Glass>
  );
}

function SalesChart({ daily, total }: { daily: DailyRevenue[]; total: number }) {
  const max = Math.max(1, ...daily.map((d) => d.amount));
  const n = daily.length;
  const ticks = [1, 8, 15, 22, 29].filter((d) => d <= n);
  return (
    <Glass className="p-5 lg:p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold leading-[22px]">Booth sales by day</h2>
        <span className="text-xs text-text-muted">{pkr(total)}</span>
      </div>
      <div className="flex h-[110px] items-end gap-[3px] lg:h-[160px] lg:gap-1.5" role="img" aria-label={`Booth sales by day, total ${pkr(total)}`}>
        {daily.map((d) => (
          <div
            key={d.date}
            className="min-w-0 flex-1 rounded-t-[4px]"
            style={
              d.amount > 0
                ? { height: `${Math.max(4, (d.amount / max) * 100)}%`, background: "linear-gradient(to top, var(--color-gold-dark), var(--color-gold-light))" }
                : { height: 14, background: "var(--color-surface-inset)" }
            }
          />
        ))}
      </div>
      <div className="relative mt-2 h-4">
        {ticks.map((d) => (
          <span key={d} className="absolute text-xs text-text-muted" style={{ left: `${((d - 1) / n) * 100}%` }}>
            {d}
          </span>
        ))}
      </div>
    </Glass>
  );
}

function AttendanceCard({ rows, perDay }: { rows: AttendanceSummaryRow[]; perDay: EmployeeAttendance[] | null }) {
  return (
    <Glass className="p-5 lg:p-6">
      <h2 className="mb-4 text-base font-semibold leading-[22px]">Attendance</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-text-muted">No employees found</p>
      ) : (
        <div className="space-y-5">
          {rows.map((emp) => {
            const days = (perDay?.find((p) => p.id === emp.id)?.days ?? []).filter((d) => d.status !== "future");
            return (
              <div key={emp.id}>
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="text-sm font-medium">{emp.name}</span>
                  <span className="text-xs text-text-muted">{plural(emp.daysPresent, "day", "days")}</span>
                </div>
                {days.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {days.map((d) => (
                      <span
                        key={d.date}
                        title={`${formatDate(d.date)} — ${d.status}`}
                        className="h-[22px] w-2.5 rounded-[3px]"
                        style={{ background: d.status === "present" ? "var(--color-success)" : "var(--color-surface-inset)" }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Glass>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-3 lg:space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-3 lg:grid-cols-[704fr_392fr] lg:gap-4">
        <Glass className="p-5 lg:p-8"><Skel className="h-[200px] lg:h-[230px]" /></Glass>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-4">
          <Glass className="p-5"><Skel className="h-[90px]" /></Glass>
          <Glass className="p-5"><Skel className="h-[90px]" /></Glass>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[716fr_380fr] lg:gap-4">
        <Glass className="p-5"><Skel className="h-[150px] lg:h-[210px]" /></Glass>
        <Glass className="hidden p-5 lg:block"><Skel className="h-[210px]" /></Glass>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
        <Glass className="p-5"><Skel className="h-[160px]" /></Glass>
        <Glass className="p-5"><Skel className="h-[160px]" /></Glass>
      </div>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DashboardClient() {
  const [month, setMonth] = useState(currentMonth);
  const [, setVersion] = useState(0); // bumps when the cache is refreshed
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMonth = useCallback(async (m: string) => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, attRes] = await Promise.all([
        fetch(`/api/dashboard?month=${m}`),
        fetch(`/api/attendance?month=${m}`),
      ]);
      if (!dashRes.ok) {
        const e = (await dashRes.json()) as { error?: string };
        setError(e.error ?? "Failed to load dashboard");
        return;
      }
      const dashboard = (await dashRes.json()) as DashboardResponse;
      let attendance: EmployeeAttendance[] | null = null;
      if (attRes.ok) {
        const a = (await attRes.json()) as { employees?: EmployeeAttendance[] } | EmployeeAttendance[];
        attendance = Array.isArray(a) ? a : (a.employees ?? null);
      }
      monthCache.set(m, { dashboard, attendance });
      setVersion((v) => v + 1);
    } catch {
      setError("Could not reach server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchMonth(month); }, [month, fetchMonth]);

  const cached = monthCache.get(month);
  const data = cached?.dashboard ?? null;

  const hasActivity =
    !!data &&
    (data.totalRevenue > 0 || data.totalExpenses > 0);
  // Depreciation alone doesn't count: it accrues every month with no entries.

  const payoutVenueNames = data ? data.revenueByVenue.filter((v) => v.payoutCycles > 0).map((v) => v.venueName) : [];
  const boothVenueNames = data ? data.revenueByVenue.filter((v) => v.shiftCount > 0).map((v) => v.venueName) : [];

  const boothSales = data ? data.totalRevenue - data.payoutRevenue - data.bookingRevenue : 0;
  const revenueRows: BarRow[] = data
    ? [
        { label: "Booth sales", sub: boothVenueNames.join(", ") || undefined, amount: boothSales },
        ...(data.payoutRevenue > 0
          ? [{
              label: "Venue payouts",
              sub: [plural(data.payoutCyclesPaid, "cycle", "cycles"), ...payoutVenueNames].join(" · "),
              amount: data.payoutRevenue,
            }]
          : []),
        ...(data.bookingRevenue > 0
          ? [{ label: "Booking payments", sub: plural(data.bookingPaymentsCount, "payment", "payments"), amount: data.bookingRevenue }]
          : []),
      ]
    : [];

  // Rent taken out of venue payouts is shown on the Rent row (it is counted
  // once, in totalExpenses) — merged into the Rent category if one exists.
  const expenseRows: BarRow[] = [];
  if (data) {
    const cats = data.expensesByCategory.map((c) => ({ ...c }));
    let rentSub: string | undefined;
    if (data.payoutRent > 0) {
      rentSub = `${payoutVenueNames.join(", ") || "Venue"}, from payout`;
      const rent = cats.find((c) => c.category === "Rent");
      if (rent) rent.amount += data.payoutRent;
      else cats.push({ category: "Rent", amount: data.payoutRent });
    }
    cats.sort((a, b) => b.amount - a.amount);
    for (const c of cats) {
      expenseRows.push({ label: c.category, sub: c.category === "Rent" ? rentSub : undefined, amount: c.amount });
    }
    if (data.depreciation > 0) {
      expenseRows.push({ label: "Depreciation", sub: "non-cash", amount: data.depreciation, muted: true });
    }
  }

  return (
    <div className="min-h-screen pb-24 text-text">
      <main className="mx-auto w-full max-w-[1112px] px-4 pb-6 pt-5 lg:px-0 lg:pr-8 lg:pt-8">
        {/* Header */}
        <header className="mb-3 flex flex-col gap-3 lg:mb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <LMark className="h-8 w-8 rounded-[10px] text-base lg:hidden" />
            <h1 className="font-display text-[26px] font-semibold leading-[34px] tracking-[-0.01em] lg:text-[28px]">Dashboard</h1>
          </div>
          <MonthPill label={formatMonthLabel(month)} onPrev={() => setMonth(prevMonth)} onNext={() => setMonth(nextMonth)} />
        </header>

        {error && (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-[20px] border border-danger/50 bg-danger/15 px-4 py-3 text-sm text-danger lg:mb-4">
            <span>{error}</span>
            <button
              onClick={() => { void fetchMonth(month); }}
              className="shrink-0 rounded-lg border border-danger/50 px-3 py-1.5 text-xs font-semibold"
            >
              Try again
            </button>
          </div>
        )}

        {!data && !error && <DashboardSkeleton />}

        {data && (
          <div className={cx("space-y-3 transition-opacity duration-150 lg:space-y-4", loading && "opacity-90")}>
            {/* Rent-coverage alert */}
            {data.rentCoverage.map((item) => (
              <div
                key={item.venueName}
                className="flex items-start gap-3 rounded-[20px] border border-danger/50 bg-danger/[0.14] p-4 lg:p-5"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-danger/25 text-danger">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 4l9.5 16h-19z" /><path d="M12 10v4M12 17.2h.01" />
                  </svg>
                </span>
                <div>
                  <p className="text-base font-semibold leading-[22px]">Next {item.venueName} payout may not cover rent</p>
                  <p className="mt-1 text-sm text-text-muted">
                    {pkr(item.rentAmount)} rent comes out of {item.venueName}’s payout, but no payout is dated this month.
                    {item.nextPayoutDue
                      ? ` Next payout expected ${formatDate(item.nextPayoutDue)}.`
                      : " No payout date entered yet."}
                  </p>
                </div>
              </div>
            ))}

            {!hasActivity ? (
              <Glass className="mx-auto flex max-w-md flex-col items-center px-6 py-12 text-center">
                <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-inset text-text-muted">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 13l3-8h12l3 8" /><path d="M3 13v6a1 1 0 001 1h16a1 1 0 001-1v-6h-5l-1 2h-4l-1-2z" />
                  </svg>
                </span>
                <h2 className="text-base font-semibold leading-[22px]">No entries this month yet</h2>
                <p className="mt-1 text-sm text-text-muted">Sales, expenses and attendance show up here once a shift is logged.</p>
                <Link
                  href="/entry"
                  className="mt-5 inline-flex min-h-[44px] items-center rounded-xl px-5 text-sm font-semibold text-bg-deep transition-opacity duration-150 hover:opacity-90"
                  style={{ background: "var(--gradient-gold)" }}
                >
                  Add today&apos;s entry
                </Link>
              </Glass>
            ) : (
              <>
                {/* Row 1 */}
                <div className="grid gap-3 lg:grid-cols-[704fr_392fr] lg:gap-4">
                  <Glass className="p-5 lg:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-xs font-medium text-text-muted">
                          <span className="h-2 w-2 rounded-full bg-gold" />
                          Net profit · {formatMonthLabel(month)}
                        </p>
                        <p
                          className={cx(
                            "mt-3 font-display text-[30px] font-bold leading-[34px] tracking-[-0.015em] lg:mt-4 lg:text-[56px] lg:font-extrabold lg:leading-[60px] lg:tracking-[-0.025em]",
                            data.netProfit < 0 && "text-danger",
                          )}
                        >
                          {data.netProfit < 0 ? "−" : ""}{pkr(Math.abs(data.netProfit))}
                        </p>
                      </div>
                      <div className="lg:hidden"><PhotoStrip small /></div>
                      <div className="hidden lg:block"><PhotoStrip /></div>
                    </div>
                    <div className="mt-6 grid grid-cols-3 gap-4 border-t border-border pt-5">
                      <div>
                        <p className="text-xs font-medium text-text-muted">Revenue</p>
                        <p className="mt-1 font-display text-[16px] font-bold leading-[22px] tracking-[-0.01em] lg:text-[22px] lg:leading-[26px]">{Math.round(data.totalRevenue).toLocaleString("en-PK")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-muted">Cash expenses</p>
                        <p className="mt-1 font-display text-[16px] font-bold leading-[22px] tracking-[-0.01em] lg:text-[22px] lg:leading-[26px]">{Math.round(data.totalExpenses).toLocaleString("en-PK")}</p>
                      </div>
                      <div>
                        <p className="text-xs font-medium text-text-muted"><span className="lg:hidden">Deprec.</span><span className="hidden lg:inline">Depreciation</span></p>
                        <p className="mt-1 font-display text-[16px] font-bold leading-[22px] tracking-[-0.01em] text-text-muted lg:text-[22px] lg:leading-[26px]">{Math.round(data.depreciation).toLocaleString("en-PK")}</p>
                      </div>
                    </div>
                  </Glass>

                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-4">
                    <Glass className="p-5">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold lg:text-base lg:leading-[22px]">
                          Owed to staff
                        </h2>
                        {data.owedToEmployees > 0 && (
                          <span className="hidden rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-medium text-gold-light lg:inline">Unpaid</span>
                        )}
                      </div>
                      <p className="mt-2 font-display text-[18px] font-bold leading-[26px] tracking-[-0.01em] lg:mt-3 lg:text-[30px] lg:leading-[34px] lg:tracking-[-0.015em]">
                        {pkr(data.owedToEmployees)}
                      </p>
                    </Glass>
                    <Glass className="p-5">
                      <h2 className="text-sm font-semibold lg:text-base lg:leading-[22px]">
                        <span className="lg:hidden">Free · waste</span><span className="hidden lg:inline">Free &amp; waste prints</span>
                      </h2>
                      <p className="mt-2 font-display text-[18px] font-bold leading-[26px] tracking-[-0.01em] lg:hidden">
                        {data.freePrintsCount} · {data.wastePrints}
                      </p>
                      <div className="mt-3 hidden grid-cols-2 gap-4 lg:grid">
                        <div>
                          <p className="font-display text-[30px] font-bold leading-[34px] tracking-[-0.015em]">{data.freePrintsCount}</p>
                          <p className="text-xs text-text-muted">Free prints</p>
                        </div>
                        <div>
                          <p className="font-display text-[30px] font-bold leading-[34px] tracking-[-0.015em]">{data.wastePrints}</p>
                          <p className="text-xs text-text-muted">Waste prints</p>
                        </div>
                      </div>
                      <p className="mt-3 hidden text-xs text-text-muted lg:block">Tracked only. Not deducted from revenue.</p>
                    </Glass>
                  </div>
                </div>

                {/* Row 2 — chart, then (mobile order) sources + categories, attendance last */}
                <div className="grid gap-3 lg:grid-cols-[716fr_380fr] lg:gap-4">
                  <SalesChart daily={data.dailyRevenue} total={boothSales} />
                  <div className="hidden lg:block">
                    <AttendanceCard rows={data.attendance} perDay={cached?.attendance ?? null} />
                  </div>
                </div>

                {/* Row 3 */}
                <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
                  <BarList
                    title="Revenue by source"
                    rows={revenueRows}
                    fill="gold"
                    footnote="Cash basis. Payouts count in the month received, not when the cycle ends."
                  />
                  <BarList title="Expenses by category" rows={expenseRows} fill="raised" />
                </div>

                <div className="lg:hidden">
                  <AttendanceCard rows={data.attendance} perDay={cached?.attendance ?? null} />
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <BottomNav role="owner" />
    </div>
  );
}
