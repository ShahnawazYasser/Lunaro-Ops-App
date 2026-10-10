import Button from "./Button";

interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="mx-4 mt-4 p-3 rounded-xl text-sm flex items-center justify-between gap-3 bg-danger/15 text-danger border border-danger/30">
      <span>{message}</span>
      {onRetry && (
        <Button variant="outline" size="xs" className="shrink-0 px-3!" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
