// Shown instantly while a screen's server data loads. The nav (AppShell) is already
// on screen because it lives in the layout; this only fills the page area.
export default function Loading() {
  return (
    <div className="bg-bg text-text" aria-busy="true" aria-label="Loading">
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-5 lg:space-y-4 lg:px-8 lg:py-8">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-surface" />
        <div className="grid gap-3 lg:grid-cols-[704fr_392fr] lg:gap-4">
          <div className="glass h-[200px] animate-pulse rounded-[20px] lg:h-[230px]" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:gap-4">
            <div className="glass h-[90px] animate-pulse rounded-[20px]" />
            <div className="glass h-[90px] animate-pulse rounded-[20px]" />
          </div>
        </div>
        <div className="glass h-[160px] animate-pulse rounded-[20px]" />
        <div className="glass h-[160px] animate-pulse rounded-[20px]" />
      </div>
    </div>
  );
}
