import Button from "./Button";

interface MonthSwitcherProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  /** "pill" is the dashboard's glass pill; default is the plain bar. */
  variant?: "default" | "pill";
}

const PILL_BTN =
  "flex h-10 w-10 lg:h-9 lg:w-9 shrink-0 items-center justify-center rounded-full bg-surface-inset text-text transition-colors duration-150 hover:bg-surface-raised";

export default function MonthSwitcher({ label, onPrev, onNext, variant = "default" }: MonthSwitcherProps) {
  if (variant === "pill") {
    return (
      <div className="glass flex w-full items-center justify-between rounded-full p-1.5 lg:w-[280px]">
        <button className={PILL_BTN} onClick={onPrev} aria-label="Previous month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <span className="text-sm font-semibold">{label}</span>
        <button className={PILL_BTN} onClick={onNext} aria-label="Next month">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between">
      <Button variant="secondary" size="sm" className="px-4! text-sm!" onClick={onPrev} aria-label="Previous month">
        ←
      </Button>
      <span className="text-sm font-medium">{label}</span>
      <Button variant="secondary" size="sm" className="px-4! text-sm!" onClick={onNext} aria-label="Next month">
        →
      </Button>
    </div>
  );
}
