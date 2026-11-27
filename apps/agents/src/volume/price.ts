/** What the alert shows of a pool's price: token Y per token X at the active bin, in USD too, and that bin's id. */
export type PoolPrice = {
  readonly quote: number;
  readonly quoteSymbol: string;
  readonly usd: number | null;
  readonly activeBinId: number | null;
};

/**
 * The datapi's `current_price` is the active bin's price in UI units, so the bin is
 * `log(price per lamport) / log(1 + binStep / 10000)`; rounding absorbs float error, not a bin.
 */
export function activeBinFromPrice(
  price: number,
  binStep: number,
  decimalsX: number,
  decimalsY: number,
): number | null {
  if (!(price > 0) || !(binStep > 0)) return null;
  const perLamport = price * 10 ** (decimalsY - decimalsX);
  const bin = Math.round(Math.log(perLamport) / Math.log1p(binStep / 10_000));
  return Number.isFinite(bin) ? bin : null;
}
