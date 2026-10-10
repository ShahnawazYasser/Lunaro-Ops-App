import type { ReactNode } from "react";
import Badge from "./Badge";

interface PageHeaderProps {
  title: string;
  /** Rendered under the title row, e.g. a MonthSwitcher */
  children?: ReactNode;
}

export default function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-20 px-4 py-3 bg-bg border-b border-border">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-gold">{title}</span>
        <Badge>Owner</Badge>
      </div>
      {children && <div className="mt-3">{children}</div>}
    </header>
  );
}
