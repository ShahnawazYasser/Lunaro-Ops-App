import type { ReactNode } from "react";

export default function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-xs font-semibold uppercase tracking-widest text-text-muted ${className ?? "mb-2"}`}>
      {children}
    </p>
  );
}
