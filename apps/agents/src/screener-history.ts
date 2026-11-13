import { SCREENER_BASELINE } from "@vexis/db/screen";
import type { StoredReading } from "./Db.ts";
import { type MinuteVolume, volumeDelta } from "./spike.ts";

/** One screener pool's last cumulative reading and its newest per-minute volumes, oldest first. */
export type PoolHistory = { readonly last: StoredReading; readonly minutes: ReadonlyArray<MinuteVolume> };
export type History = ReadonlyMap<string, PoolHistory>;

const MINUTE_MS = 60_000;
/** Enough minutes for `SCREENER_BASELINE` valid readings even when about half are unknown, like `pool_minutes`. */
export const HISTORY_MINUTES = SCREENER_BASELINE * 2 + 1;

/**
 * Adds `minute`'s reading of every pool and drops pools unseen for longer than the buffer spans. A pool read twice
 * in one minute keeps its first reading.
 */
export function recordMinute(
  history: History,
  readings: ReadonlyArray<{ readonly address: string; readonly cumulativeVolume: number }>,
  minute: number,
): History {
  const next = new Map<string, PoolHistory>();
  for (const [address, pool] of history) {
    if (minute - pool.last.minute < HISTORY_MINUTES * MINUTE_MS) next.set(address, pool);
  }
  for (const { address, cumulativeVolume } of readings) {
    const previous = next.get(address);
    if (previous?.last.minute === minute) continue;
    const reading = { minute, cumulativeVolume };
    const volume = volumeDelta(previous?.last, reading);
    next.set(address, {
      last: reading,
      minutes: [...(previous?.minutes ?? []), { minute, volume }].slice(-HISTORY_MINUTES),
    });
  }
  return next;
}
