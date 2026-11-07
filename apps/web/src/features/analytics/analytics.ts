export type Currency = "native" | "usd";

export const TIMEFRAMES = [
  { id: "5m", label: "5m", seconds: 300 },
  { id: "30m", label: "30m", seconds: 1800 },
  { id: "1h", label: "1h", seconds: 3600 },
  { id: "4h", label: "4h", seconds: 14_400 },
  { id: "24h", label: "1D", seconds: 86_400 },
] as const;

/** Windows the pool endpoint reports volume and fees for. It has no 5m window. */
export const STAT_WINDOWS = ["30m", "1h", "2h", "4h", "12h", "24h"] as const;
export type StatWindow = (typeof STAT_WINDOWS)[number];

export type TimeframeId = (typeof TIMEFRAMES)[number]["id"];

/** The API rejects spans over 100 bars, so every request asks for this many. */
export const BAR_COUNT = 96;

export const timeframe = (id: TimeframeId) => TIMEFRAMES.find((t) => t.id === id) ?? TIMEFRAMES[2];

/** Price is token X in token Y; volume is USD. `t` is the bar open in ms. */
export interface Bar {
  t: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface VolumePoint {
  t: number;
  volume: number;
  fees: number;
}

/** `yUsd` is the USD price of token Y; `native` keeps prices in Y and shows volume in Y units. */
export function convertBars(bars: Bar[], currency: Currency, yUsd: number): Bar[] {
  if (yUsd <= 0) return bars;
  if (currency === "native") return bars.map((b) => ({ ...b, volume: b.volume / yUsd }));
  return bars.map((b) => ({
    t: b.t,
    open: b.open * yUsd,
    high: b.high * yUsd,
    low: b.low * yUsd,
    close: b.close * yUsd,
    volume: b.volume,
  }));
}

export const sumVolume = (points: { volume: number }[]) => points.reduce((a, p) => a + p.volume, 0);

/** One DLMM bin. `price` is token Y per token X; `x` and `y` are token amounts, not raw units. */
export interface BinView {
  id: number;
  price: number;
  x: number;
  y: number;
}

export interface DistributionBar {
  id: number;
  price: number;
  xUsd: number;
  yUsd: number;
  active: boolean;
}

/**
 * Liquidity in USD of each bin within `reach` of the active bin, one bar per bin in price order. Bins below the
 * active price hold token Y, bins above hold X, and the active bin holds both.
 */
export function binDistribution(
  bins: BinView[],
  activeId: number,
  reach: number,
  xUsd: number,
  yUsd: number,
): DistributionBar[] {
  return bins
    .filter((b) => Math.abs(b.id - activeId) <= reach)
    .sort((a, b) => a.id - b.id)
    .map((b) => ({ id: b.id, price: b.price, xUsd: b.x * xUsd, yUsd: b.y * yUsd, active: b.id === activeId }));
}

/** `0` when the denominator is empty so a dead pool shows 0x, not Infinity. */
export const ratio = (num: number, den: number) => (den > 0 ? num / den : 0);

export const perMinute = (perDay: number) => perDay / 1440;

/** Evenly spaced axis values: `count` points from `min` to `max`, inclusive. */
export function ticks(min: number, max: number, count: number): number[] {
  if (count < 2) return [min];
  return Array.from({ length: count }, (_, i) => max - ((max - min) * i) / (count - 1));
}

/** `12m`, `5h`, `3mo 12d`, `1y 2mo`: pool, token and trade ages. */
export function age(fromMs: number, now: number): string {
  const elapsed = Math.max(0, now - fromMs);
  const days = Math.floor(elapsed / 86_400_000);
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (days < 1) return `${Math.floor(elapsed / 3_600_000)}h`;
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo ${days % 30}d`;
  return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo`;
}

export type FeeMode = "both" | "quote";

/** `collect_fee_mode` from the pool config: 0 collects both tokens, 1 only token Y. */
export const feeMode = (raw: number): FeeMode => (raw === 1 ? "quote" : "both");

/** Protocol fee as a share of the trade, e.g. a 0.25% base fee with a 10% cut is 0.025%. */
export const protocolFeePct = (baseFeePct: number, protocolCutPct: number) => (baseFeePct * protocolCutPct) / 100;
