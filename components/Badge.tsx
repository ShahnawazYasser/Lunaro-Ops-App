import type { ReactNode } from "react";
import { cx } from "./cx";

export type BadgeTone = "gold" | "success" | "danger" | "muted" | "outline";

interface BadgeProps {
  tone?: BadgeTone;
  /** pill = rounded status chip, tag = small uppercase label */
  shape?: "pill" | "tag";
  /** When set, renders as a tappable button */
  onClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
}

const TONES: Record<BadgeTone, string> = {
  gold: "bg-gold/15 text-gold",
  success: "bg-success/15 text-success",
  danger: "bg-danger/15 text-danger",
  muted: "bg-text-muted/15 text-text-muted",
  outline: "text-gold border border-gold/45",
};

const SHAPES = {
  pill: "text-xs px-2 py-0.5 rounded-full font-medium",
  tag: "text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide",
};

export default function Badge({
  tone = "gold",
  shape = "pill",
  onClick,
  disabled,
  children,
}: BadgeProps) {
  const cls = cx("inline-block shrink-0", TONES[tone], SHAPES[shape], disabled && "opacity-60");
  if (onClick) {
    return (
      <button type="button" onClick={onClick} disabled={disabled} className={cls}>
        {children}
      </button>
    );
  }
  return <span className={cls}>{children}</span>;
}
