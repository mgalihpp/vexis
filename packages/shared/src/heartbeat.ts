/** Runtime schedules that write a heartbeat, which runtime owns each, and how long without a tick counts as stale. */
export const SCHEDULES = {
  cycle: { runtime: "runner", staleMs: 180_000 },
  screener: { runtime: "runner", staleMs: 180_000 },
  rebalance: { runtime: "runner", staleMs: 180_000 },
  "office-executor": { runtime: "runner", staleMs: 180_000 },
  "office-monitor": { runtime: "runner", staleMs: 180_000 },
  "office-bookkeeper": { runtime: "runner", staleMs: 180_000 },
  prune: { runtime: "runner", staleMs: 2 * 3_600_000 },
  "office-tick": { runtime: "office", staleMs: 180_000 },
  "office-inbox": { runtime: "office", staleMs: 180_000 },
} as const;

export type ScheduleName = keyof typeof SCHEDULES;
export type Runtime = (typeof SCHEDULES)[ScheduleName]["runtime"];

/** The inbox ticks every 3 seconds; one write per this many ms is enough to see it is alive. */
export const MIN_WRITE_MS = 30_000;

export type Beat = {
  readonly name: string;
  readonly lastTickAt: Date | null;
  readonly lastError: string | null;
  readonly lastErrorAt: Date | null;
  readonly alertedAt: Date | null;
};

export type Verdict =
  | { readonly kind: "stale"; readonly name: string; readonly sinceMs: number; readonly lastError: string | null }
  | { readonly kind: "recovered"; readonly name: string };

/**
 * What a watchdog should say about `runtime`'s schedules. A schedule with no row yet is not watched (never
 * started); one is stale when its last good tick is older than its limit and no alert is open; an open alert is
 * recovered once a good tick is fresh again. Everything else is silent, so an outage sends one message.
 */
export function judge(beats: ReadonlyArray<Beat>, runtime: Runtime, now: number): ReadonlyArray<Verdict> {
  const out: Verdict[] = [];
  for (const beat of beats) {
    const spec = SCHEDULES[beat.name as ScheduleName];
    if (!spec || spec.runtime !== runtime) continue;
    if (beat.lastTickAt === null) continue;
    const age = now - beat.lastTickAt.getTime();
    const stale = age > spec.staleMs;
    if (stale && beat.alertedAt === null) {
      out.push({ kind: "stale", name: beat.name, sinceMs: age, lastError: beat.lastError });
    } else if (!stale && beat.alertedAt !== null) {
      out.push({ kind: "recovered", name: beat.name });
    }
  }
  return out;
}

const minutes = (ms: number) =>
  ms >= 3_600_000 ? `${Math.round(ms / 360_000) / 10} h` : `${Math.round(ms / 60_000)} min`;

/** Plain text for the admin's Telegram chat. */
export const verdictText = (v: Verdict) =>
  v.kind === "recovered"
    ? `Vexis: ${v.name} is ticking again.`
    : `Vexis: ${v.name} has not completed a tick for ${minutes(v.sinceMs)}.${v.lastError ? ` Last error: ${v.lastError.slice(0, 300)}` : ""}`;
