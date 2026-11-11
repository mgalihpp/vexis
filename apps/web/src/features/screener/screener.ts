export const WINDOWS = ["30m", "1h", "2h", "4h", "12h", "24h"] as const;
export type FeeWindow = (typeof WINDOWS)[number];
/** Fee/TVL per window, in percent as the datapi sends it (0.21 means 0.21%). */
export type FeeWindows = Record<FeeWindow, number>;

const HOURS: Record<FeeWindow, number> = { "30m": 0.5, "1h": 1, "2h": 2, "4h": 4, "12h": 12, "24h": 24 };

export interface ScreenerToken {
  mint: string;
  symbol: string;
  icon: string | null;
  verified: boolean;
  /** The issuer still holds the freeze authority. */
  freezable: boolean;
}

export interface ScreenerPool {
  address: string;
  name: string;
  binStep: number;
  baseFeePct: number;
  tvl: number;
  volume24h: number;
  fees24h: number;
  feeTvl: FeeWindows;
  createdAt: number;
  blacklisted: boolean;
  tags: string[];
  launchpad: string | null;
  tokenX: ScreenerToken;
  tokenY: ScreenerToken;
}

export interface Screener {
  pools: ScreenerPool[];
  at: number;
  /** Pools Meteora has above the floor; more than `pools.length` when the one page could not hold them all. */
  total: number;
}

/** The server never loads pools below these, so a user minimum cannot go lower. */
export const FLOOR = { tvl: 1_000, volume: 1_000 } as const;
export const TVL_STEPS = [1_000, 10_000, 50_000, 100_000, 500_000, 1_000_000] as const;
export const VOLUME_STEPS = [1_000, 5_000, 25_000, 100_000, 500_000, 1_000_000] as const;

/**
 * Fee/TVL earned per hour in each stretch between two windows, oldest first: 24h to 12h ago, then 12h to 4h,
 * 4h to 2h, 2h to 1h, 1h to 30m, and the last 30 minutes.
 */
export function feePace(f: FeeWindows): number[] {
  const out: number[] = [];
  for (let i = WINDOWS.length - 1; i >= 0; i--) {
    const outer = WINDOWS[i] as FeeWindow;
    const inner = WINDOWS[i - 1];
    const span = HOURS[outer] - (inner ? HOURS[inner] : 0);
    out.push(Math.max(0, f[outer] - (inner ? f[inner] : 0)) / span);
  }
  return out;
}

/** Last hour's Fee/TVL against the 24h hourly average. Above 1, fees are arriving faster than the day's pace. */
export const momentum = (f: FeeWindows) => (f["24h"] > 0 ? f["1h"] / (f["24h"] / 24) : null);

export const turnover = (p: Pick<ScreenerPool, "volume24h" | "tvl">) => (p.tvl > 0 ? p.volume24h / p.tvl : null);

/** The datapi's `apr` is the 24h Fee/TVL; a year of days at that pace, not compounded. */
export const apr = (f: FeeWindows) => f["24h"] * 365;

export type StepBand = "tight" | "medium" | "wide";
export const STEP_BANDS: { id: StepBand; label: string }[] = [
  { id: "tight", label: "≤20" },
  { id: "medium", label: "25–80" },
  { id: "wide", label: "≥100" },
];
export const stepBand = (binStep: number): StepBand => (binStep <= 20 ? "tight" : binStep < 100 ? "medium" : "wide");

const QUOTES = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

export type WarningKind = "blacklisted" | "unverified" | "freezable" | "tag";
export interface Warning {
  kind: WarningKind;
  label: string;
  detail: string;
}

/** Risk flags read from the pool row itself. SOL, USDC and USDT are never flagged for their freeze authority. */
export function warnings(p: ScreenerPool): Warning[] {
  const out: Warning[] = [];
  if (p.blacklisted) out.push({ kind: "blacklisted", label: "Blacklisted", detail: "Meteora blacklisted this pool." });
  const tokens = [p.tokenX, p.tokenY];
  const unverified = tokens.filter((t) => !t.verified).map((t) => t.symbol);
  if (unverified.length > 0) {
    out.push({ kind: "unverified", label: "Unverified", detail: `${unverified.join(" and ")} is not verified.` });
  }
  const freezable = tokens.filter((t) => t.freezable && !QUOTES.has(t.mint)).map((t) => t.symbol);
  if (freezable.length > 0) {
    out.push({
      kind: "freezable",
      label: "Freezable",
      detail: `The issuer of ${freezable.join(" and ")} can freeze it.`,
    });
  }
  for (const tag of p.tags) out.push({ kind: "tag", label: tag, detail: `Meteora tag: ${tag}` });
  return out;
}

type SortValue = number | string | null;
export const SORTS = {
  feeTvl24h: { label: "Fee/TVL 24h", value: (p: ScreenerPool): SortValue => p.feeTvl["24h"] },
  feeTvl1h: { label: "Fee/TVL 1h", value: (p: ScreenerPool): SortValue => p.feeTvl["1h"] },
  momentum: { label: "Fee momentum", value: (p: ScreenerPool): SortValue => momentum(p.feeTvl) },
  volume: { label: "Volume 24h", value: (p: ScreenerPool): SortValue => p.volume24h },
  tvl: { label: "TVL", value: (p: ScreenerPool): SortValue => p.tvl },
  turnover: { label: "Volume/TVL", value: (p: ScreenerPool): SortValue => turnover(p) },
  fee: { label: "Base fee", value: (p: ScreenerPool): SortValue => p.baseFeePct },
  binStep: { label: "Bin step", value: (p: ScreenerPool): SortValue => p.binStep },
  age: { label: "Pool age", value: (p: ScreenerPool): SortValue => -p.createdAt },
  name: { label: "Pair", value: (p: ScreenerPool): SortValue => p.name.toLowerCase() },
} as const;
export type SortKey = keyof typeof SORTS;
export const SORT_KEYS = Object.keys(SORTS) as [SortKey, ...SortKey[]];
export type SortDir = "asc" | "desc";

export interface ScreenerFilters {
  minTvl: number;
  minVolume: number;
  step: StepBand | "all";
  query: string;
  blacklisted: boolean;
}

function matches(p: ScreenerPool, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (q.length >= 32) return [p.address, p.tokenX.mint, p.tokenY.mint].some((a) => a.toLowerCase() === q);
  const symbols = [p.tokenX.symbol.toLowerCase(), p.tokenY.symbol.toLowerCase()];
  return q
    .split(/[\s\-/]+/)
    .filter(Boolean)
    .every((term) => symbols.some((s) => s.includes(term)));
}

/** The pools that pass the filters, sorted. A pool with no value for the sort column goes last in either direction. */
export function screen(pools: ScreenerPool[], f: ScreenerFilters, sort: SortKey, dir: SortDir): ScreenerPool[] {
  const value = SORTS[sort].value;
  const sign = dir === "asc" ? 1 : -1;
  return pools
    .filter(
      (p) =>
        p.tvl >= f.minTvl &&
        p.volume24h >= f.minVolume &&
        (f.blacklisted || !p.blacklisted) &&
        (f.step === "all" || stepBand(p.binStep) === f.step) &&
        matches(p, f.query),
    )
    .map((pool) => ({ pool, key: value(pool) }))
    .sort((a, b) => {
      if (a.key === null || b.key === null) return a.key === b.key ? 0 : a.key === null ? 1 : -1;
      if (a.key === b.key) return b.pool.tvl - a.pool.tvl;
      return (a.key < b.key ? -1 : 1) * sign;
    })
    .map((r) => r.pool);
}

export function totals(pools: ScreenerPool[]) {
  let tvl = 0;
  let volume24h = 0;
  let fees24h = 0;
  for (const p of pools) {
    tvl += p.tvl;
    volume24h += p.volume24h;
    fees24h += p.fees24h;
  }
  return { tvl, volume24h, fees24h, feeTvl: tvl > 0 ? (fees24h / tvl) * 100 : null };
}
