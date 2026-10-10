import Button from "./Button";

interface MonthSwitcherProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}

export default function MonthSwitcher({ label, onPrev, onNext }: MonthSwitcherProps) {
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
