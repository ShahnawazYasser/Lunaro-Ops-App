import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type CardTone = "default" | "gold" | "danger";
export type CardSize = "sm" | "md" | "list";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: CardTone;
  /** sm = compact list row, md = panel / form container, list = tight wrapper around divided rows */
  size?: CardSize;
  dim?: boolean;
}

const TONES: Record<CardTone, string> = {
  default: "bg-surface border border-[rgba(200,212,224,0.10)]",
  gold: "bg-gold/10 border border-gold/30",
  danger: "bg-danger/10 border border-danger/35",
};

const SIZES: Record<CardSize, string> = {
  sm: "rounded-xl p-3.5",
  md: "rounded-2xl p-4",
  list: "rounded-2xl p-2",
};

export default function Card({
  tone = "default",
  size = "md",
  dim,
  className,
  ...rest
}: CardProps) {
  return (
    <div
      className={cx(TONES[tone], SIZES[size], dim && "opacity-60", className)}
      {...rest}
    />
  );
}
