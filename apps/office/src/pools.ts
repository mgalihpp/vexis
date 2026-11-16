import type { FilterPool } from "@vexis/shared/screen";

// Each office screens this list with its own filter (`office_config.pool_preset`, or `pool_filter` for custom),
// resolved in `tick.ts`. The Scout and the Risk Manager's `pool_alertable` check read the same filter.

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/** A screener pool as the office reads it. */
export type OfficePool = FilterPool & {
  readonly address: string;
  readonly name: string;
  /** Fees over TVL in the last 24h, in percent; null when the API has none. */
  readonly feeTvl24h: number | null;
};

export type ScreenerSnapshot = {
  readonly pools: ReadonlyArray<OfficePool>;
  /** USD per SOL, read off the deepest pool holding SOL; null when no pool on the list prices it. */
  readonly solUsd: number | null;
  readonly fetchedAt: number;
};

/** SOL's USD price from the highest-TVL pool that has SOL on one side with a price for it. */
export function solUsdOf(
  rows: ReadonlyArray<{
    readonly tvl: number;
    readonly tokens: ReadonlyArray<{ readonly mint: string; readonly price: number | null }>;
  }>,
) {
  let best: { tvl: number; price: number } | null = null;
  for (const row of rows) {
    const price = row.tokens.find((t) => t.mint === WSOL_MINT)?.price;
    if (price && price > 0 && (best === null || row.tvl > best.tvl)) best = { tvl: row.tvl, price };
  }
  return best?.price ?? null;
}
