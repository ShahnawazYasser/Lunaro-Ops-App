"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

// Auto sign-out after this much inactivity — hardens a phone left logged
// in as Owner from being a standing risk if it's lost or set down unlocked.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

// Minimal SVG icons — 20×20, stroke-based
function IconEntry() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h5" strokeLinecap="round" />
    </svg>
  );
}
function IconReimburse() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v2m0 0c-1.1 0-2 .9-2 2s.9 2 2 2 2 .9 2 2-.9 2-2 2m0-8c1.1 0 2 .9 2 2m-2 6v2" strokeLinecap="round" />
    </svg>
  );
}
function IconAttendance() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 9h18" strokeLinecap="round" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" strokeLinecap="round" strokeWidth="2.2" />
    </svg>
  );
}
function IconDashboard() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </svg>
  );
}
function IconEntries() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" strokeLinecap="round" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" strokeLinecap="round" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const EMPLOYEE_NAV: NavItem[] = [
  { href: "/entry", label: "Daily Entry", icon: <IconEntry /> },
  { href: "/reimburse", label: "Reimburse", icon: <IconReimburse /> },
];

const OWNER_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <IconDashboard /> },
  { href: "/attendance", label: "Attendance", icon: <IconAttendance /> },
  { href: "/entries", label: "Entries", icon: <IconEntries /> },
  { href: "/reimburse", label: "Reimburse", icon: <IconReimburse /> },
];

export default function BottomNav({ role }: { role: string }) {
  const pathname = usePathname();
  const items = role === "owner" ? OWNER_NAV : EMPLOYEE_NAV;
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex safe-area-pb"
      style={{
        backgroundColor: "#16293D",
        borderTop: "1px solid rgba(200,212,224,0.12)",
      }}
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-[10px] font-medium transition-colors min-w-0"
            style={{ color: active ? "#C9A84C" : "#8A9BAD" }}
          >
            {item.icon}
            <span className="truncate max-w-full px-0.5">{item.label}</span>
          </Link>
        );
      })}
      <button
        onClick={() => { void handleLogout(); }}
        aria-label="Sign out"
        className="shrink-0 flex flex-col items-center justify-center py-3 px-3.5 gap-1 text-[10px] font-medium transition-colors"
        style={{ color: "#8A9BAD", borderLeft: "1px solid rgba(200,212,224,0.12)" }}
      >
        <IconLogout />
      </button>
    </nav>
  );
}
