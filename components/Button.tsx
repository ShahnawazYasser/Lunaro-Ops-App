import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "tint" | "outline" | "danger" | "destructive";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANTS: Record<ButtonVariant, string> = {
  // Gold fill — the one primary action on a screen
  primary: "bg-gold text-bg font-semibold",
  // Quiet outline — cancel, month arrows, retry-style actions
  secondary: "text-text-muted border border-[rgba(200,212,224,0.15)] font-medium",
  // Gold tint — in-card actions such as Edit
  tint: "bg-gold/15 text-gold font-semibold",
  // Gold outline — retry
  outline: "text-gold border border-gold/40",
  // Red outline — delete entry points
  danger: "text-danger border border-danger/35 font-medium",
  // Solid red — the confirming click on a destructive dialog
  destructive: "bg-danger text-white font-semibold",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "px-2 py-1 text-xs rounded-lg",
  sm: "px-3 py-2 text-xs rounded-lg",
  md: "px-4 py-2.5 text-sm rounded-xl",
  lg: "px-4 py-3.5 text-sm rounded-xl",
};

export default function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "transition-opacity disabled:opacity-60",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
}
