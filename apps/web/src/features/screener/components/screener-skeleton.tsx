const ROWS = Array.from({ length: 10 }, (_, i) => i);

function Block({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-muted ${className}`} />;
}

export function ScreenerSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 p-2 md:p-4">
      <Block className="h-7 w-40" />
      <Block className="h-[4.75rem] w-full rounded-[10px]" />
      <Block className="h-8 w-full lg:w-2/3" />
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1 lg:gap-0 lg:rounded-[10px] lg:border lg:bg-card">
        {ROWS.map((i) => (
          <div
            key={i}
            className="rounded-[10px] border bg-card p-3 lg:rounded-none lg:border-0 lg:border-b lg:bg-transparent"
          >
            <Block className="h-24 w-full lg:h-6" />
          </div>
        ))}
      </div>
    </div>
  );
}
