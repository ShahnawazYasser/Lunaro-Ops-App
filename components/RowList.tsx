import type { ReactNode } from "react";
import Card from "./Card";

/** Card wrapping divided rows (venue revenue, category totals, attendance...). */
export function RowList({ children }: { children: ReactNode }) {
  return (
    <Card size="list" className="divide-y divide-border">
      {children}
    </Card>
  );
}

interface RowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  value: ReactNode;
  /** gold = money that matters, text = plain, muted = non-cash / de-emphasised */
  tone?: "gold" | "text" | "muted";
  italic?: boolean;
}

export function Row({ title, subtitle, value, tone = "gold", italic }: RowProps) {
  const toneCls = tone === "gold" ? "text-gold" : tone === "text" ? "text-text" : "text-text-muted";
  const ital = italic ? "italic" : "";
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <div>
        <p className={`text-sm font-medium ${ital} ${italic ? "text-text-muted" : ""}`}>{title}</p>
        {subtitle && <p className="text-xs text-text-muted">{subtitle}</p>}
      </div>
      <span className={`text-sm font-semibold ${ital} ${toneCls}`}>{value}</span>
    </div>
  );
}

/** Small label/value line used inside expanded detail views. */
export function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-text-muted">{label}</span>
      <span className="text-xs font-medium text-text">{value}</span>
    </div>
  );
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 text-text-muted">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
