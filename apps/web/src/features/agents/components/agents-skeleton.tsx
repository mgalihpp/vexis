/** Shown while the agents list loads, in the fleet page's layout. */
export function FleetSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 py-4 md:px-6">
      <div className="flex items-center justify-between gap-3">
        <div className="h-[1.375rem] w-28 animate-pulse rounded-md bg-card" />
        <div className="h-8 w-28 animate-pulse rounded-md bg-card" />
      </div>
      <div className="h-[4.75rem] animate-pulse rounded-xl bg-card" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[11.5rem] animate-pulse rounded-xl bg-card" />
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">Loading agents…</p>
    </div>
  );
}

/** Shown while an agent's page (detail or wizard) loads. */
export function AgentPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 py-4 md:px-6">
      <div className="flex items-center gap-3">
        <div className="size-9 animate-pulse rounded-full bg-card" />
        <div className="h-[1.375rem] w-40 animate-pulse rounded-md bg-card" />
      </div>
      <div className="h-9 w-80 max-w-full animate-pulse rounded-md bg-card" />
      <div className="h-[22rem] animate-pulse rounded-xl bg-card" />
      <p className="text-center text-xs text-muted-foreground">Loading agent…</p>
    </div>
  );
}
