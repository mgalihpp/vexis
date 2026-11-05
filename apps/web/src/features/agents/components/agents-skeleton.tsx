function Bar() {
  return (
    <div className="flex items-center justify-between gap-2.5 border-b px-2 py-1.5">
      <div className="h-7 w-28 animate-pulse rounded-md bg-card" />
      <div className="h-7 w-24 animate-pulse rounded-md bg-card" />
    </div>
  );
}

/** Shown while the agents list loads, in the fleet page's layout. */
export function FleetSkeleton() {
  return (
    <div>
      <Bar />
      <div className="space-y-2 p-2">
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[6rem] animate-pulse rounded-lg bg-card" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-lg bg-card" />
        <p className="text-center text-xs text-muted-foreground">Loading agents…</p>
      </div>
    </div>
  );
}

/** Shown while an agent's page (detail or wizard) loads. */
export function AgentPageSkeleton() {
  return (
    <div>
      <Bar />
      <div className="h-9 border-b" />
      <div className="space-y-2 p-2">
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[6rem] animate-pulse rounded-lg bg-card" />
          ))}
        </div>
        <div className="grid gap-2 xl:grid-cols-[1fr_2fr]">
          <div className="h-[22rem] animate-pulse rounded-lg bg-card" />
          <div className="h-[22rem] animate-pulse rounded-lg bg-card" />
        </div>
        <p className="text-center text-xs text-muted-foreground">Loading agent…</p>
      </div>
    </div>
  );
}
