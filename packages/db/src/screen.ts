import { z } from "zod";

// The screener's pool filter, shared by the web screener and the runner's screener-mode volume alerts.

/** SOL, USDC and USDT: the quote side of a pair, never the token whose risk the pool carries. */
export const QUOTES: ReadonlySet<string> = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

/** Bounds on a screener pool. A 0 market cap or organic bound and a null max step mean no bound. */
export const PoolFilter = z.object({
  minTvl: z.number().nonnegative(),
  /** Over 24h. */
  minVolume: z.number().nonnegative(),
  /** Market cap of the non-quote token. */
  minMcap: z.number().nonnegative(),
  maxMcap: z.number().nonnegative(),
  minStep: z.number().int().nonnegative(),
  maxStep: z.number().int().positive().nullable(),
  /** Both tokens verified by Jupiter. */
  verified: z.boolean(),
  /** Jupiter organic score of the non-quote token, 0 to 100. */
  minOrganic: z.number().min(0).max(100),
});
export type PoolFilter = z.infer<typeof PoolFilter>;

/** What the filter reads of a pool. Base is the side that is not a quote (`baseOf`). */
export interface FilterPool {
  tvl: number;
  volume24h: number;
  binStep: number;
  blacklisted: boolean;
  baseMcap: number | null;
  bothVerified: boolean;
  baseOrganic: number | null;
  /** A non-quote token whose issuer still holds the freeze authority. */
  freezable: boolean;
}

export interface FilterToken {
  mint: string;
  verified: boolean;
  freezable: boolean;
  marketCap: number | null;
  organic: number | null;
}

/** The side that is not SOL, USDC or USDT, whose market cap and organic score describe the pool's risk. */
export const baseOf = <T extends { mint: string }>(x: T, y: T) => (QUOTES.has(x.mint) && !QUOTES.has(y.mint) ? y : x);

export function filterPool(p: {
  tvl: number;
  volume24h: number;
  binStep: number;
  blacklisted: boolean;
  tokenX: FilterToken;
  tokenY: FilterToken;
}): FilterPool {
  const base = baseOf(p.tokenX, p.tokenY);
  return {
    tvl: p.tvl,
    volume24h: p.volume24h,
    binStep: p.binStep,
    blacklisted: p.blacklisted,
    baseMcap: base.marketCap,
    bothVerified: p.tokenX.verified && p.tokenY.verified,
    baseOrganic: base.organic,
    freezable: [p.tokenX, p.tokenY].some((t) => t.freezable && !QUOTES.has(t.mint)),
  };
}

type Bounds = Pick<PoolFilter, "minTvl" | "minVolume" | "minMcap" | "maxMcap" | "minStep" | "maxStep">;

/** TVL, volume, market cap and bin step. A market cap bound fails a pool whose market cap is unknown. */
export function inBounds(p: Pick<FilterPool, "tvl" | "volume24h" | "binStep" | "baseMcap">, f: Bounds) {
  const capOk =
    (f.minMcap === 0 && f.maxMcap === 0) ||
    (p.baseMcap !== null && p.baseMcap >= f.minMcap && (f.maxMcap === 0 || p.baseMcap <= f.maxMcap));
  return (
    p.tvl >= f.minTvl &&
    p.volume24h >= f.minVolume &&
    capOk &&
    p.binStep >= f.minStep &&
    (f.maxStep === null || p.binStep <= f.maxStep)
  );
}

/** A pool worth an alert: in bounds, never blacklisted or freezable, and verified and organic enough when asked. */
export const alertable = (p: FilterPool, f: PoolFilter) =>
  inBounds(p, f) &&
  !p.blacklisted &&
  !p.freezable &&
  (!f.verified || p.bothVerified) &&
  (f.minOrganic === 0 || (p.baseOrganic !== null && p.baseOrganic >= f.minOrganic));

export interface ScreenerPreset {
  label: string;
  sub: string;
  filter: PoolFilter;
  /** The spike rule a pick of this preset fills in; the agent's own rule is what the runner applies. */
  mult: number;
  minUsd: number;
}

export const PRESET_IDS = ["blue-chip", "mid-cap", "degen"] as const;
export type PresetId = (typeof PRESET_IDS)[number];
export const PRESETS = [...PRESET_IDS, "custom"] as const;
export type PresetChoice = (typeof PRESETS)[number];

/** Tuning a filter here reaches every agent on that preset: configs store the id, never the filter. */
export const SCREENER_PRESETS: Record<PresetId, ScreenerPreset> = {
  "blue-chip": {
    label: "Blue chip",
    sub: "Verified, mcap over $100M, TVL and 24h volume over $500k, bin step up to 20",
    filter: {
      minTvl: 500_000,
      minVolume: 500_000,
      minMcap: 100_000_000,
      maxMcap: 0,
      minStep: 0,
      maxStep: 20,
      verified: true,
      minOrganic: 0,
    },
    mult: 3,
    minUsd: 25_000,
  },
  "mid-cap": {
    label: "Mid cap",
    sub: "Verified, organic 50+, mcap $1M to $100M, TVL over $25k, 24h volume over $50k, bin step 25 to 80",
    filter: {
      minTvl: 25_000,
      minVolume: 50_000,
      minMcap: 1_000_000,
      maxMcap: 100_000_000,
      minStep: 25,
      maxStep: 80,
      verified: true,
      minOrganic: 50,
    },
    mult: 3,
    minUsd: 3_000,
  },
  degen: {
    label: "Degen",
    sub: "Unverified allowed, mcap $100k to $10M, TVL over $10k, 24h volume over $25k, bin step 80+",
    filter: {
      minTvl: 10_000,
      minVolume: 25_000,
      minMcap: 100_000,
      maxMcap: 10_000_000,
      minStep: 80,
      maxStep: null,
      verified: false,
      minOrganic: 0,
    },
    mult: 5,
    minUsd: 2_000,
  },
};

/** The baseline a preset pick fills in. */
export const SCREENER_BASELINE = 30;
/** Longest screener-mode baseline: the runner keeps every screener pool's minutes in memory, sized for this. */
export const SCREENER_MAX_BASELINE = 60;

export interface ScreenRule {
  filter: PoolFilter;
  mult: number;
  minUsd: number;
  baseline: number;
}

/** The preset's (or custom) filter with the agent's own spike rule. Null for custom with no filter. */
export function screenRule(c: {
  preset: PresetChoice;
  custom: PoolFilter | null;
  mult: number;
  minUsd: number;
  baseline: number;
}): ScreenRule | null {
  const filter = c.preset === "custom" ? c.custom : SCREENER_PRESETS[c.preset].filter;
  return filter && { filter, mult: c.mult, minUsd: c.minUsd, baseline: c.baseline };
}
