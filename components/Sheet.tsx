import type { ReactNode } from "react";
import Button from "./Button";

interface SheetProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

/** Full-screen edit sheet with its own sticky header and Cancel button. */
export default function Sheet({ title, subtitle, onClose, children }: SheetProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-bg">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 bg-bg border-b border-border">
        <Button variant="secondary" size="sm" className="shrink-0 text-sm! px-3! py-1.5!" onClick={onClose}>
          Cancel
        </Button>
        <div className="min-w-0 text-right">
          <p className="text-sm font-semibold truncate text-gold">{title}</p>
          {subtitle && <p className="text-xs truncate text-text-muted">{subtitle}</p>}
        </div>
      </header>
      <main className="max-w-lg mx-auto px-4 py-5 pb-16">{children}</main>
    </div>
  );
}
