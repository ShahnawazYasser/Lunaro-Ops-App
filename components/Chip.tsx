import type { ReactNode } from "react";
import { cx } from "./cx";

interface ChipProps {
  active: boolean;
  onClick: () => void;
  /** sm = inline filter chip, md = full-width segmented toggle */
  size?: "sm" | "md";
  children: ReactNode;
}

export default function Chip({ active, onClick, size = "sm", children }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "font-medium transition-all",
        size === "sm" ? "px-3 py-1 rounded-lg text-xs" : "flex-1 py-2.5 rounded-xl text-sm",
        active
          ? "bg-gold/15 text-gold border border-gold/50"
          : "bg-bg text-text-muted border border-[rgba(200,212,224,0.15)]",
      )}
    >
      {children}
    </button>
  );
}
