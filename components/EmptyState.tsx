import Button from "./Button";

interface EmptyStateProps {
  message: string;
  /** Renders the message in red with a "Try again" button */
  error?: boolean;
  onRetry?: () => void;
  /** Roomier padding for full-page empty states */
  tall?: boolean;
}

export default function EmptyState({ message, error, onRetry, tall }: EmptyStateProps) {
  return (
    <div className={`text-center space-y-2 ${tall ? "py-16" : "py-8"}`}>
      <p className={`text-sm ${error ? "text-danger" : "text-text-muted"}`}>{message}</p>
      {error && onRetry && (
        <Button variant="outline" size="md" className="py-1.5!" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
