import { type FilterPool, SCREENER_PRESETS } from "@vexis/db/screen";

/**
 * The office trades blue chips only in the MVP: verified tokens, $100M+ market cap, $500k TVL and volume, bin step
 * up to 20. It needs no organic score, so the screener list costs one datapi request and no discovery request.
 */
export const OFFICE_FILTER = SCREENER_PRESETS["blue-chip"].filter;

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
