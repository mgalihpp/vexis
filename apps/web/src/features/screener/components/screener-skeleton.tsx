const ROWS = Array.from({ length: 10 }, (_, i) => i);
const TOTALS = Array.from({ length: 6 }, (_, i) => i);

function Block({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-muted ${className}`} />;
}

export function ScreenerSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 p-2 md:p-4">
      <Block className="h-8 w-40" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {TOTALS.map((i) => (
          <Block key={i} className="h-[7.5rem] rounded-lg" />
        ))}
      </div>
      <Block className="h-8 w-full lg:w-2/3" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 lg:gap-0 lg:rounded-lg lg:border">
        {ROWS.map((i) => (
          <div
            key={i}
            className="rounded-lg border bg-card p-3 lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent"
          >
            <Block className="h-24 w-full lg:h-6" />
          </div>
        ))}
      </div>
    </div>
  );
}
