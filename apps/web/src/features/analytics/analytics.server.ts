import { createRequire } from "node:module";
import type DLMMClass from "@meteora-ag/dlmm";
import { Connection, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { get } from "../portfolio/meteora.server";
import { jupiter } from "../portfolio/prices.server";
import {
  BAR_COUNT,
  type Bar,
  type BinView,
  feeMode,
  STAT_WINDOWS,
  type TimeframeId,
  timeframe,
  type VolumePoint,
} from "./analytics";
import type { ChainView, PoolSearchHit, PoolStats, PoolTokenView, PoolView, SiblingPool } from "./analytics.types";

const num = z.number();
const day = z.object({ "30m": num, "1h": num, "2h": num, "4h": num, "12h": num, "24h": num });

const TokenSchema = z.object({
  address: z.string(),
  name: z.string(),
  symbol: z.string(),
  decimals: num,
  holders: num,
  freeze_authority_disabled: z.boolean(),
  total_supply: num,
  price: num,
  market_cap: num,
});

const PoolSchema = z.object({
  address: z.string(),
  name: z.string(),
  token_x: TokenSchema,
  token_y: TokenSchema,
  token_x_amount: num,
  token_y_amount: num,
  created_at: num,
  pool_config: z.object({
    bin_step: num,
    base_fee_pct: num,
    max_fee_pct: num,
    protocol_fee_pct: num,
    collect_fee_mode: num,
  }),
  dynamic_fee_pct: num,
  tvl: num,
  current_price: num,
  volume: day,
  fees: day,
  cumulative_metrics: z.object({ volume: num, fees: num }),
});
type RawPool = z.infer<typeof PoolSchema>;

const PoolList = z.object({ data: z.array(PoolSchema), pages: z.number().optional() });

const Ohlcv = z.object({
  data: z.array(z.object({ timestamp: num, open: num, high: num, low: num, close: num, volume: num })),
});
const VolumeHistory = z.object({ data: z.array(z.object({ timestamp: num, volume: num, fees: num })) });

const SPARK_BARS = 42;
const SPARK_SECONDS = 4 * 3600;

const jupStats = z
  .object({
    priceChange: z.number().nullish(),
    buyVolume: z.number().nullish(),
    sellVolume: z.number().nullish(),
    numBuys: z.number().nullish(),
    numSells: z.number().nullish(),
    numTraders: z.number().nullish(),
  })
  .nullish();

const JupToken = z.object({
  id: z.string(),
  icon: z.string().nullish(),
  fdv: z.number().nullish(),
  createdAt: z.string().nullish(),
  mintAuthority: z.string().nullish(),
  audit: z.object({ topHoldersPercentage: z.number().nullish(), devMints: z.number().nullish() }).nullish(),
  stats5m: jupStats,
  stats1h: jupStats,
  stats6h: jupStats,
  stats24h: jupStats,
});
type JupTokenData = z.infer<typeof JupToken>;

const SOL = "So11111111111111111111111111111111111111112";
const TOKEN_CACHE_MS = 60_000;
const tokenCache = new Map<string, { at: number; value: Promise<JupTokenData | null> }>();

/** Jupiter metadata for one mint. A failed lookup only blanks the extras, so it resolves to null. */
function jupiterToken(mint: string): Promise<JupTokenData | null> {
  const hit = tokenCache.get(mint);
  if (hit && Date.now() - hit.at < TOKEN_CACHE_MS) return hit.value;
  const value = jupiter(`/tokens/v2/search?query=${mint}`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Jupiter tokens ${res.status}`))))
    .then(
      (json) =>
        z
          .array(JupToken)
          .parse(json)
          .find((t) => t.id === mint) ?? null,
    )
    .catch(() => null);
  tokenCache.set(mint, { at: Date.now(), value });
  return value;
}

const flowOf = (id: "1h" | "24h", s: z.infer<typeof jupStats>) =>
  s?.buyVolume != null && s.sellVolume != null ? { [id]: { buy: s.buyVolume, sell: s.sellVolume } } : {};

const tokenView = (raw: RawPool["token_x"], amount: number, jup: JupTokenData | null): PoolTokenView => {
  const s24 = jup?.stats24h;
  return {
    address: raw.address,
    symbol: raw.symbol,
    name: raw.name,
    icon: jup?.icon ?? null,
    price: raw.price,
    amount,
    usd: amount * raw.price,
    marketCap: raw.market_cap,
    fdv: jup?.fdv ?? null,
    holders: raw.holders,
    totalSupply: raw.total_supply,
    freezeAuthorityDisabled: raw.freeze_authority_disabled,
    mintAuthority: jup?.mintAuthority ?? null,
    createdAt: jup?.createdAt ? Date.parse(jup.createdAt) : null,
    topHoldersPct: jup?.audit?.topHoldersPercentage ?? null,
    devMints: jup?.audit?.devMints ?? null,
    changes: {
      "5m": jup?.stats5m?.priceChange ?? null,
      "1h": jup?.stats1h?.priceChange ?? null,
      "6h": jup?.stats6h?.priceChange ?? null,
      "24h": s24?.priceChange ?? null,
    },
    flow: {
      ...flowOf("1h", jup?.stats1h),
      ...flowOf("24h", s24),
    },
    traders24h: s24?.numTraders ?? null,
    swaps24h: s24 && (s24.numBuys != null || s24.numSells != null) ? (s24.numBuys ?? 0) + (s24.numSells ?? 0) : null,
  };
};

const poolView = (
  p: RawPool,
  x: JupTokenData | null,
  y: JupTokenData | null,
  stats: PoolStats | null,
  chain: ChainView | null,
): PoolView => ({
  address: p.address,
  name: p.name,
  binStep: p.pool_config.bin_step,
  baseFeePct: p.pool_config.base_fee_pct,
  maxFeePct: chain?.maxFeePct ?? p.pool_config.max_fee_pct,
  protocolCutPct: p.pool_config.protocol_fee_pct,
  dynamicFeePct: chain ? Math.max(0, chain.totalFeePct - p.pool_config.base_fee_pct) : p.dynamic_fee_pct,
  stats,
  feeMode: feeMode(p.pool_config.collect_fee_mode),
  createdAt: p.created_at < 1e12 ? p.created_at * 1000 : p.created_at,
  price: p.current_price,
  tvl: p.tvl,
  volume24h: p.volume["24h"],
  fees24h: p.fees["24h"],
  windows: Object.fromEntries(
    STAT_WINDOWS.map((w) => [w, { volume: p.volume[w], fees: p.fees[w] }]),
  ) as PoolView["windows"],
  cumulativeVolume: p.cumulative_metrics.volume,
  cumulativeFees: p.cumulative_metrics.fees,
  tokenX: tokenView(p.token_x, p.token_x_amount, x),
  tokenY: tokenView(p.token_y, p.token_y_amount, y),
});

const Discovery = z.object({
  data: z.array(
    z.object({
      pool_address: z.string(),
      active_tvl: num,
      fee_active_tvl_ratio: num,
      volume_active_tvl_ratio: num,
      unique_lps: num,
      total_lps: num,
      positions_created: num,
      open_positions: num,
      active_positions: num,
      swap_count: num,
      unique_traders: num,
      net_deposits: num,
      volatility: num,
    }),
  ),
});

/** Meteora's pool-discovery API: the LP, position and trade counts the pool endpoint lacks. 24h window. */
async function poolStats(address: string): Promise<PoolStats | null> {
  try {
    const url = new URL("https://pool-discovery-api.datapi.meteora.ag/pools");
    url.searchParams.set("page_size", "1");
    url.searchParams.set("timeframe", "24h");
    url.searchParams.set("query", address);
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const row = Discovery.parse(await res.json()).data.find((r) => r.pool_address === address);
    if (!row) return null;
    return {
      activeTvl: row.active_tvl,
      feeActiveTvl: row.fee_active_tvl_ratio / 100,
      volumeActiveTvl: row.volume_active_tvl_ratio / 100,
      uniqueLps: row.unique_lps,
      totalLps: row.total_lps,
      positionsCreated: row.positions_created,
      openPositions: row.open_positions,
      inRangePositions: row.active_positions,
      swaps: row.swap_count,
      traders: row.unique_traders,
      netDeposits: row.net_deposits,
      volatility: row.volatility,
    };
  } catch {
    return null;
  }
}

// The SDK's ESM build imports directories, which Node's loader (and so `vite dev`) rejects, so load its CJS build.
const sdk: unknown = createRequire(import.meta.url)("@meteora-ag/dlmm");
const DLMM = ((sdk as { default?: unknown }).default ?? sdk) as typeof DLMMClass;

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC);
const CHAIN_CACHE_MS = 15_000;
const BIN_REACH = 60;
const chainCache = new Map<string, { at: number; value: Promise<ChainView | null> }>();

/** Bins around the active one and the fee settings, read from the pool account through the DLMM SDK. */
function chainData(address: string): Promise<ChainView | null> {
  const hit = chainCache.get(address);
  if (hit && Date.now() - hit.at < CHAIN_CACHE_MS) return hit.value;
  const value = (async (): Promise<ChainView> => {
    const dlmm = await DLMM.create(connection, new PublicKey(address));
    const { activeBin, bins } = await dlmm.getBinsAroundActiveBin(BIN_REACH, BIN_REACH);
    const dx = 10 ** dlmm.tokenX.mint.decimals;
    const dy = 10 ** dlmm.tokenY.mint.decimals;
    const fees = dlmm.getFeeInfo();
    const view: BinView[] = bins.map((b) => ({
      id: b.binId,
      price: Number(b.pricePerToken),
      x: Number(b.xAmount.toString()) / dx,
      y: Number(b.yAmount.toString()) / dy,
    }));
    return {
      activeBinId: activeBin,
      bins: view,
      maxFeePct: Number(fees.maxFeeRatePercentage.toString()),
      totalFeePct: Number(dlmm.getDynamicFee().toString()),
    };
  })().catch(() => null);
  chainCache.set(address, { at: Date.now(), value });
  return value;
}

const listPools = (params: Record<string, string | number>) => get("/pools", PoolList, params).then((r) => r.data);

async function resolvePool(address: string | undefined): Promise<RawPool> {
  if (address) return get(`/pools/${address}`, PoolSchema, {});
  const [top] = await listPools({ page_size: 1, sort_by: "volume_24h:desc", filter_by: "is_blacklisted=false" });
  if (!top) throw new Error("Meteora returned no pools");
  return top;
}

const SIBLING_PAGE = 100;
const SIBLING_MAX_PAGES = 5;

/** Same pair, any bin step, every page of it. */
async function pairPools(x: string, y: string): Promise<RawPool[]> {
  const out: RawPool[] = [];
  for (let page = 1; page <= SIBLING_MAX_PAGES; page++) {
    const r = await get("/pools", PoolList, {
      page,
      page_size: SIBLING_PAGE,
      filter_by: `token_x=${x} && token_y=${y}`,
    });
    out.push(...r.data);
    if (page >= (r.pages ?? 1) || r.data.length < SIBLING_PAGE) break;
  }
  return out;
}

/** Every pool of the pair, in either token order, busiest first. */
async function siblingPools(x: string, y: string): Promise<SiblingPool[]> {
  const [forward, backward] = await Promise.all([pairPools(x, y), pairPools(y, x)]);
  const seen = new Set<string>();
  const out: SiblingPool[] = [];
  for (const p of [...forward, ...backward]) {
    if (seen.has(p.address)) continue;
    seen.add(p.address);
    out.push({
      address: p.address,
      binStep: p.pool_config.bin_step,
      baseFeePct: p.pool_config.base_fee_pct,
      tvl: p.tvl,
      volume24h: p.volume["24h"],
      fees24h: p.fees["24h"],
    });
  }
  return out.sort((a, b) => b.volume24h - a.volume24h || b.tvl - a.tvl || a.binStep - b.binStep);
}

// The window ends at the next bar boundary, so the API can return a bar that has not opened yet.
const toBars = (rows: z.infer<typeof Ohlcv>["data"]): Bar[] =>
  rows
    .filter((r) => r.timestamp * 1000 <= Date.now())
    .map((r) => ({
      t: r.timestamp * 1000,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume,
    }));

const toVolume = (rows: z.infer<typeof VolumeHistory>["data"]): VolumePoint[] =>
  rows.map((r) => ({ t: r.timestamp * 1000, volume: r.volume, fees: r.fees }));

export interface AnalyticsRequest {
  pool?: string | undefined;
  tf: TimeframeId;
}

export async function loadAnalytics({ pool, tf }: AnalyticsRequest) {
  const raw = await resolvePool(pool);
  const frame = timeframe(tf);
  const end = Math.floor(Date.now() / 1000 / frame.seconds) * frame.seconds + frame.seconds;
  const sparkEnd = Math.floor(Date.now() / 1000 / SPARK_SECONDS) * SPARK_SECONDS + SPARK_SECONDS;
  const span = { start_time: end - BAR_COUNT * frame.seconds, end_time: end };
  const [siblings, ohlcv, history, spark, jupX, jupY, stats, chain] = await Promise.all([
    siblingPools(raw.token_x.address, raw.token_y.address).catch(() => []),
    get(`/pools/${raw.address}/ohlcv`, Ohlcv, { timeframe: frame.id, ...span }),
    // Candles carry no fees; the chart's Fees view reads them from here, matched by bar time.
    get(`/pools/${raw.address}/volume/history`, VolumeHistory, { timeframe: frame.id, ...span }).catch(() => ({
      data: [],
    })),
    get(`/pools/${raw.address}/volume/history`, VolumeHistory, {
      timeframe: "4h",
      start_time: sparkEnd - SPARK_BARS * SPARK_SECONDS,
      end_time: sparkEnd,
    }).catch(() => ({ data: [] })),
    jupiterToken(raw.token_x.address),
    jupiterToken(raw.token_y.address),
    poolStats(raw.address),
    chainData(raw.address),
  ]);
  return {
    now: Date.now(),
    tf,
    pool: poolView(raw, jupX, jupY, stats, chain),
    chain,
    siblings,
    bars: toBars(ohlcv.data),
    history: toVolume(history.data),
    spark: toVolume(spark.data),
    quoteIsSol: raw.token_y.address === SOL,
  };
}

export interface OlderRequest {
  pool: string;
  tf: TimeframeId;
  /** Open time in ms of the oldest bar already loaded. */
  before: number;
}

/** The 96 bars before `before`, for panning the chart back through history. */
export async function loadOlder({ pool, tf, before }: OlderRequest) {
  const frame = timeframe(tf);
  const end = Math.floor(before / 1000);
  const span = { start_time: end - BAR_COUNT * frame.seconds, end_time: end };
  const [ohlcv, history] = await Promise.all([
    get(`/pools/${pool}/ohlcv`, Ohlcv, { timeframe: frame.id, ...span }),
    get(`/pools/${pool}/volume/history`, VolumeHistory, { timeframe: frame.id, ...span }).catch(() => ({ data: [] })),
  ]);
  return {
    bars: toBars(ohlcv.data).filter((b) => b.t < before),
    history: toVolume(history.data).filter((h) => h.t < before),
  };
}

export async function searchPools(query: string): Promise<PoolSearchHit[]> {
  const pools = await listPools({ page_size: 8, query, sort_by: "volume_24h:desc", filter_by: "is_blacklisted=false" });
  return pools.map((p) => ({
    address: p.address,
    name: p.name,
    binStep: p.pool_config.bin_step,
    tvl: p.tvl,
    volume24h: p.volume["24h"],
  }));
}

const VOLUME_BARS = 25;

/** Volume for the last 25 bars of a timeframe, with the current, still open bar last. */
export async function loadRecentVolume(pool: string, tf: TimeframeId): Promise<VolumePoint[]> {
  const { seconds } = timeframe(tf);
  const end = Math.floor(Date.now() / 1000 / seconds) * seconds + seconds;
  const r = await get(`/pools/${pool}/volume/history`, VolumeHistory, {
    timeframe: tf,
    start_time: end - VOLUME_BARS * seconds,
    end_time: end,
  });
  return toVolume(r.data.filter((row) => row.timestamp * 1000 <= Date.now()));
}
