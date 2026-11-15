/** Shown while the office loads, in the page's layout. */
export function OfficeSkeleton() {
  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-3 px-4 pt-4 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <div className="h-6 w-36 animate-pulse rounded-md bg-card" />
          <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-card" />
        </div>
        <div className="h-8 w-64 animate-pulse rounded-md bg-card" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[4.75rem] animate-pulse rounded-lg bg-card" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="aspect-[5/3] animate-pulse rounded-lg bg-card" />
        <div className="flex flex-col gap-3">
          <div className="h-48 animate-pulse rounded-lg bg-card" />
          <div className="h-40 animate-pulse rounded-lg bg-card" />
        </div>
      </div>
      <p className="text-center text-xs text-muted-foreground">Opening the office…</p>
    </div>
  );
}
