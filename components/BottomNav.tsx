"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "./cx";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

// Auto sign-out after this much inactivity — hardens a phone left logged
// in as Owner from being a standing risk if it's lost or set down unlocked.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Inline SVG icons — 24px viewBox, 1.8px stroke, round caps, no icon library
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconDashboard = () => (
  <Icon>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
  </Icon>
);
const IconEntries = () => (
  <Icon>
    <path d="M7 3h10a1 1 0 011 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 011-1z" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);
const IconExpenses = () => (
  <Icon>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
    <path d="M9.5 8.5h5M9.5 12h5" />
  </Icon>
);
const IconBookings = () => (
  <Icon>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M8 3v4M16 3v4M3.5 10h17" />
  </Icon>
);
const IconPayouts = () => (
  <Icon>
    <rect x="3" y="6" width="18" height="12" rx="2.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M6.5 12h.01M17.5 12h.01" />
  </Icon>
);
const IconAssets = () => (
  <Icon>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
  </Icon>
);
const IconAttendance = () => (
  <Icon>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16 4.6a3.5 3.5 0 010 6.8M18 14.4c2 .8 3.5 2.6 3.5 5.6" />
  </Icon>
);
const IconDailyEntry = () => (
  <Icon>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </Icon>
);
const IconMore = () => (
  <Icon>
    <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="2.6" />
  </Icon>
);
const IconLogout = () => (
  <Icon>
    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Icon>
);

const EMPLOYEE_NAV: NavItem[] = [
  { href: "/entry", label: "Daily Entry", icon: <IconDailyEntry /> },
  { href: "/reimburse", label: "My Expenses", icon: <IconExpenses /> },
];

// Owner order mirrors the Figma sidebar: money screens first, then a divider,
// then the day-to-day staff screens.
const OWNER_MAIN: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <IconDashboard /> },
  { href: "/entries", label: "Entries", icon: <IconEntries /> },
  { href: "/expenses", label: "Expenses", icon: <IconExpenses /> },
  { href: "/bookings", label: "Bookings", icon: <IconBookings /> },
  { href: "/payouts", label: "Payouts", icon: <IconPayouts /> },
  { href: "/assets", label: "Assets", icon: <IconAssets /> },
];
const OWNER_SECONDARY: NavItem[] = [
  { href: "/attendance", label: "Attendance", icon: <IconAttendance /> },
  { href: "/entry", label: "Daily entry", icon: <IconDailyEntry /> },
];

// First three owner items sit in the mobile bar; everything else goes in "More".
const OWNER_MOBILE_TABS = 3;

// Shared layout wrapper: reserve room for the desktop sidebar (248 + 24 + 24)
// on every page that renders the shell. Emitted here (not per page) so it is
// server-rendered with the nav and never flashes unpadded. Mobile bottom room
// (96px) is already provided by each page's existing pb-24.
const SHELL_CSS = "@media (min-width:1024px){body{padding-left:296px}}";

export default function BottomNav({ role }: { role: string }) {
  const pathname = usePathname();
  const isOwner = role === "owner";
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The sheet is tied to the path it was opened on, so any route change
  // closes it without needing an effect.
  const [moreOpenAt, setMoreOpenAt] = useState<string | null>(null);
  const moreOpen = moreOpenAt === pathname;
  const setMoreOpen = (open: boolean) => setMoreOpenAt(open ? pathname : null);

  const handleLogout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  // Idle-timeout: any tap/key/scroll resets the clock; no activity for
  // IDLE_TIMEOUT_MS signs the session out automatically.
  useEffect(() => {
    const resetTimer = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(() => { void handleLogout(); }, IDLE_TIMEOUT_MS);
    };

    const activityEvents: (keyof WindowEventMap)[] = ["mousedown", "keydown", "touchstart", "scroll"];
    activityEvents.forEach((evt) => window.addEventListener(evt, resetTimer));
    resetTimer();

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, resetTimer));
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [handleLogout]);

  const desktopMain = isOwner ? OWNER_MAIN : EMPLOYEE_NAV;
  const desktopSecondary = isOwner ? OWNER_SECONDARY : [];
  const mobileTabs = isOwner ? OWNER_MAIN.slice(0, OWNER_MOBILE_TABS) : EMPLOYEE_NAV;
  const moreItems = isOwner ? [...OWNER_MAIN.slice(OWNER_MOBILE_TABS), ...OWNER_SECONDARY] : [];
  const moreActive = moreItems.some((i) => i.href === pathname);
  const userLabel = isOwner ? "Owner" : "Staff";

  return (
    <>
      <style>{SHELL_CSS}</style>

      {/* ── Desktop: floating glass sidebar ─────────────────────────── */}
      <aside className="glass hidden lg:flex fixed left-6 top-6 bottom-6 z-30 w-[248px] flex-col rounded-[20px] p-4">
        <div className="flex items-center gap-3 px-1 pb-5 pt-1">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl font-display text-xl font-bold text-bg-deep"
            style={{ background: "var(--gradient-gold)" }}
          >
            L
          </div>
          <span className="font-display text-[18px] font-bold leading-[22px] tracking-[-0.005em] text-text">
            Lunaro Ops
          </span>
        </div>

        <nav className="flex flex-col gap-1">
          {desktopMain.map((item) => (
            <SidebarRow key={item.href} item={item} active={pathname === item.href} />
          ))}
          {desktopSecondary.length > 0 && <div className="my-2 h-px bg-border" />}
          {desktopSecondary.map((item) => (
            <SidebarRow key={item.href} item={item} active={pathname === item.href} />
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-3 rounded-xl bg-surface-inset p-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-raised text-sm font-semibold text-gold-light">
            {userLabel[0]}
          </div>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-text">{userLabel}</span>
          <button
            onClick={() => { void handleLogout(); }}
            aria-label="Sign out"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:text-text"
          >
            <IconLogout />
          </button>
        </div>
      </aside>

      {/* ── Mobile: floating bottom bar ─────────────────────────────── */}
      <nav
        className="glass lg:hidden fixed inset-x-4 bottom-4 z-30 flex h-[68px] items-center gap-1 rounded-[20px] px-2"
        style={{ background: "rgb(22 41 61 / 0.9)", marginBottom: "env(safe-area-inset-bottom)" }}
      >
        {mobileTabs.map((item) => (
          <TabLink key={item.href} item={item} active={pathname === item.href} />
        ))}
        {isOwner ? (
          <TabButton
            label="More"
            icon={<IconMore />}
            active={moreActive || moreOpen}
            onClick={() => setMoreOpen(!moreOpen)}
          />
        ) : (
          <TabButton label="Sign out" icon={<IconLogout />} active={false} onClick={() => { void handleLogout(); }} />
        )}
      </nav>

      {/* ── Mobile: More sheet ──────────────────────────────────────── */}
      {isOwner && moreOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-bg-deep/60"
            onClick={() => setMoreOpen(false)}
          />
          <div className="glass absolute inset-x-0 bottom-0 rounded-t-[20px] px-4 pb-8 pt-3">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />
            <div className="flex flex-col gap-1">
              {moreItems.map((item) => (
                <SidebarRow key={item.href} item={item} active={pathname === item.href} />
              ))}
              <div className="my-2 h-px bg-border" />
              <button
                onClick={() => { void handleLogout(); }}
                className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium text-text-muted"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-surface-inset">
                  <IconLogout />
                </span>
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SidebarRow({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "relative flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors duration-150",
        active ? "glass-row font-semibold text-text" : "font-medium text-text-muted hover:text-text",
      )}
      style={active ? { background: "rgb(31 58 87 / 0.55)", border: "1px solid rgb(255 255 255 / 0.14)" } : { border: "1px solid transparent" }}
    >
      <span
        className={cx(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]",
          active ? "text-bg-deep" : "bg-surface-inset text-text-muted",
        )}
        style={active ? { background: "var(--gradient-gold)", boxShadow: "0 4px 18px -6px rgb(201 168 76 / 0.4)" } : undefined}
      >
        {item.icon}
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={tabClass(active)}
      style={active ? { background: "rgb(31 58 87 / 0.6)" } : undefined}
    >
      {item.icon}
      <span className="max-w-full truncate">{item.label}</span>
    </Link>
  );
}

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={tabClass(active)}
      style={active ? { background: "rgb(31 58 87 / 0.6)" } : undefined}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

function tabClass(active: boolean): string {
  return cx(
    "flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-medium transition-colors duration-150",
    active ? "text-gold-light" : "text-text-muted",
  );
}
