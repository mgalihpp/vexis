import type { VolumeWatchConfig } from "@vexis/db/agents";

/** One `pool_minutes` row as the spike rule sees it. `volume` is null where the delta is unknown. */
export type MinuteVolume = { readonly minute: number; readonly volume: number | null };

export type Spike = {
  /** USD volume in the latest minute. */
  readonly vol1m: number;
  /** Median of the baseline window. */
  readonly baseline: number;
  /** vol1m / baseline; Infinity when the baseline is 0. */
  readonly ratio: number;
};

/** A delta is trusted only when the two readings are at most this far apart (1.5 minutes). */
export const MAX_GAP_MS = 90_000;
/** The latest reading must be this fresh, otherwise there is nothing current to judge. */
export const STALE_MS = 120_000;

export function median(values: ReadonlyArray<number>): number {
  const sorted = values.toSorted((a, b) => a - b);
  const mid = sorted.length >> 1;
  const upper = sorted[mid] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[mid - 1] ?? 0) + upper) / 2;
}

/**
 * Volume traded between two cumulative readings, or null when the delta cannot be trusted: the
 * first reading of a pool, a gap longer than `MAX_GAP_MS`, or a cumulative total that went down.
 */
export function volumeDelta(
  previous: { readonly minute: number; readonly cumulativeVolume: number } | undefined,
  current: { readonly minute: number; readonly cumulativeVolume: number },
): number | null {
  if (!previous) return null;
  if (current.minute - previous.minute > MAX_GAP_MS) return null;
  if (current.cumulativeVolume < previous.cumulativeVolume) return null;
  return current.cumulativeVolume - previous.cumulativeVolume;
}

/**
 * Judges the newest row of `minutes` (ascending by minute) against the median of the
 * `config.baseline` valid rows before it. Returns null while warming up (fewer valid rows than the
 * window), when the newest row is stale or unknown, or when it is not a spike. `minUsd` also keeps
 * a zero median from turning dust into an alert.
 */
export function evaluateSpike(
  minutes: ReadonlyArray<MinuteVolume>,
  config: Pick<VolumeWatchConfig, "mult" | "baseline" | "minUsd">,
  now: number,
): Spike | null {
  const latest = minutes.at(-1);
  if (!latest || latest.volume === null || now - latest.minute > STALE_MS) return null;

  const window = minutes
    .slice(0, -1)
    .flatMap((row) => (row.volume === null ? [] : [row.volume]))
    .slice(-config.baseline);
  if (window.length < config.baseline) return null;

  const baseline = median(window);
  const ratio = baseline === 0 ? Number.POSITIVE_INFINITY : latest.volume / baseline;
  if (latest.volume < config.minUsd || ratio < config.mult) return null;
  return { vol1m: latest.volume, baseline, ratio };
}
