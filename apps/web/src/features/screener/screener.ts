export const WINDOWS = ["30m", "1h", "2h", "4h", "12h", "24h"] as const;
export type FeeWindow = (typeof WINDOWS)[number];
export type Windowed = Record<FeeWindow, number>;
/** Fee/TVL per window, in percent as the datapi sends it (0.21 means 0.21%). */
export type FeeWindows = Windowed;

const HOURS: Record<FeeWindow, number> = { "30m": 0.5, "1h": 1, "2h": 2, "4h": 4, "12h": 12, "24h": 24 };

export interface ScreenerToken {
  mint: string;
  symbol: string;
  icon: string | null;
  verified: boolean;
  /** The issuer still holds the freeze authority. */
  freezable: boolean;
  /** The issuer can still mint more. Only known when the discovery API answered. */
  mintable: boolean;
  marketCap: number | null;
  holders: number | null;
  /** Jupiter's organic score, 0 to 100: how much of the token's trading looks like real users. */
  organic: number | null;
  /** Percent of supply held by the top holders. */
  topHolders: number | null;
}

/** 24h liquidity, flow and trading figures from Meteora's pool-discovery API. Percents are percent (3.8 is 3.8%). */
export interface PoolStats {
  activeTvl: number;
  /** Fees against the TVL inside the active range, which is the liquidity that actually earns. */
  feeActiveTvl: number;
  swaps: number;
  traders: number;
  lps: number;
  openPositions: number;
  /** Share of open positions whose range holds the active bin. */
  inRangePct: number;
  deposits: number;
  withdrawals: number;
  netDeposits: number;
  volatility: number;
  /** Null for a pool too new for the API to compare against (it sends exactly 0). */
  priceChange: number | null;
  volumeChange: number | null;
  /** Pool price over the window, oldest first. */
  trend: number[];
}

export interface ScreenerPool {
  address: string;
  name: string;
  binStep: number;
  baseFeePct: number;
  tvl: number;
  /** USD volume per window. */
  volume: Windowed;
  fees24h: number;
  feeTvl: FeeWindows;
  createdAt: number;
  blacklisted: boolean;
  tags: string[];
  launchpad: string | null;
  tokenX: ScreenerToken;
  tokenY: ScreenerToken;
  /** Token X's share of the reserves by USD value, 0 to 1. */
  xShare: number | null;
  /** Null when the discovery API failed or does not list the pool. */
  stats: PoolStats | null;
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
/** Market cap bounds; 0 is no bound. */
export const MCAP_MIN_STEPS = [0, 100_000, 500_000, 1_000_000, 10_000_000, 100_000_000] as const;
export const MCAP_MAX_STEPS = [0, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000] as const;

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

export const turnover = (p: Pick<ScreenerPool, "volume" | "tvl">) => (p.tvl > 0 ? p.volume["24h"] / p.tvl : null);

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

/** Token X's share of the pool by USD value; unknown when either side has no value. */
export function xShare(xUsd: number, yUsd: number) {
  const sum = xUsd + yUsd;
  return Number.isFinite(sum) && sum > 0 ? xUsd / sum : null;
}

/** The side that is not SOL, USDC or USDT, whose market cap and holders describe the pool's risk. */
export const baseToken = (p: Pick<ScreenerPool, "tokenX" | "tokenY">) =>
  QUOTES.has(p.tokenX.mint) && !QUOTES.has(p.tokenY.mint) ? p.tokenY : p.tokenX;

/** Top holders owning this share of supply or more is flagged. */
export const CONCENTRATED_PCT = 50;

export type WarningKind = "blacklisted" | "unverified" | "freezable" | "mintable" | "concentrated" | "tag";
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
  const mintable = tokens.filter((t) => t.mintable && !QUOTES.has(t.mint)).map((t) => t.symbol);
  if (mintable.length > 0) {
    out.push({
      kind: "mintable",
      label: "Mintable",
      detail: `The issuer of ${mintable.join(" and ")} can still mint more.`,
    });
  }
  const base = baseToken(p);
  if (!QUOTES.has(base.mint) && base.topHolders !== null && base.topHolders >= CONCENTRATED_PCT) {
    out.push({
      kind: "concentrated",
      label: "Concentrated",
      detail: `The top holders own ${Math.round(base.topHolders)}% of ${base.symbol}.`,
    });
  }
  for (const tag of p.tags) out.push({ kind: "tag", label: tag, detail: `Meteora tag: ${tag}` });
  return out;
}

type SortValue = number | string | null;
/** `w` is the volume window the page shows; only the volume sort reads it. */
export const SORTS = {
  feeTvl24h: { label: "Fee/TVL 24h", value: (p: ScreenerPool): SortValue => p.feeTvl["24h"] },
  feeTvl1h: { label: "Fee/TVL 1h", value: (p: ScreenerPool): SortValue => p.feeTvl["1h"] },
  feeActiveTvl: { label: "Fee/active TVL", value: (p: ScreenerPool): SortValue => p.stats?.feeActiveTvl ?? null },
  momentum: { label: "Fee momentum", value: (p: ScreenerPool): SortValue => momentum(p.feeTvl) },
  priceChange: { label: "Price change", value: (p: ScreenerPool): SortValue => p.stats?.priceChange ?? null },
  netDeposits: { label: "Net deposits", value: (p: ScreenerPool): SortValue => p.stats?.netDeposits ?? null },
  swaps: { label: "Swaps", value: (p: ScreenerPool): SortValue => p.stats?.swaps ?? null },
  traders: { label: "Traders", value: (p: ScreenerPool): SortValue => p.stats?.traders ?? null },
  volatility: { label: "Volatility", value: (p: ScreenerPool): SortValue => p.stats?.volatility ?? null },
  marketCap: { label: "Market cap", value: (p: ScreenerPool): SortValue => baseToken(p).marketCap },
  organic: { label: "Organic score", value: (p: ScreenerPool): SortValue => baseToken(p).organic },
  volume: { label: "Volume", value: (p: ScreenerPool, w: FeeWindow): SortValue => p.volume[w] },
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
  /** Over 24h, the window the server's floor uses. */
  minVolume: number;
  /** Market cap of the non-quote token; 0 means no bound. */
  minMcap: number;
  maxMcap: number;
  window: FeeWindow;
  step: StepBand | "all";
  query: string;
  blacklisted: boolean;
}

function inCapRange(p: ScreenerPool, min: number, max: number) {
  if (min === 0 && max === 0) return true;
  const cap = baseToken(p).marketCap;
  return cap !== null && cap >= min && (max === 0 || cap <= max);
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
        p.volume["24h"] >= f.minVolume &&
        inCapRange(p, f.minMcap, f.maxMcap) &&
        (f.blacklisted || !p.blacklisted) &&
        (f.step === "all" || stepBand(p.binStep) === f.step) &&
        matches(p, f.query),
    )
    .map((pool) => ({ pool, key: value(pool, f.window) }))
    .sort((a, b) => {
      if (a.key === null || b.key === null) return a.key === b.key ? 0 : a.key === null ? 1 : -1;
      if (a.key === b.key) return b.pool.tvl - a.pool.tvl;
      return (a.key < b.key ? -1 : 1) * sign;
    })
    .map((r) => r.pool);
}

export function totals(pools: ScreenerPool[], window: FeeWindow = "24h") {
  let tvl = 0;
  let volume = 0;
  let volume24h = 0;
  let fees24h = 0;
  let swaps = 0;
  let netDeposits = 0;
  let withStats = 0;
  for (const p of pools) {
    tvl += p.tvl;
    volume += p.volume[window];
    volume24h += p.volume["24h"];
    fees24h += p.fees24h;
    if (!p.stats) continue;
    withStats++;
    swaps += p.stats.swaps;
    netDeposits += p.stats.netDeposits;
  }
  const flow = withStats > 0 ? { swaps, netDeposits } : { swaps: null, netDeposits: null };
  return {
    tvl,
    volume,
    fees24h,
    feeTvl: tvl > 0 ? (fees24h / tvl) * 100 : null,
    turnover: tvl > 0 ? volume24h / tvl : null,
    ...flow,
  };
}
