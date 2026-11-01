import { z } from "zod";
import {
  type ClosedPoolRef,
  freshCount,
  type PoolCache,
  readPoolCache,
  stalePools,
  writePoolCache,
} from "./closed-history.server";
import type {
  ActiveAmounts,
  ActivePool,
  ActivePosition,
  Amounts,
  ClosedPosition,
  PoolMeta,
  Portfolio,
  PositionEvent,
  Token,
  Transactions,
} from "./portfolio";
import { loadTokenInfo } from "./prices.server";
import {
  collectHistories,
  type HistoryCache,
  type HistoryRef,
  historyQueue,
  readHistoryCache,
  writeHistoryCache,
} from "./transaction-history.server";

// Meteora DLMM data API. Schema: docs/meteora/dlmm-openapi.json
const API = process.env.METEORA_DATAPI_URL ?? "https://dlmm.datapi.meteora.ag";
const CACHE_MS = 60_000;
const CONCURRENCY = 6;

const num = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null || v === "" ? 0 : Number(v)));

const Side = z.object({ sol: num, usd: num });
const Total = z.object({ total: Side });
const TokenAmount = z.object({ usd: num, amountSol: num });

const Unrealized = z.object({
  balances: num,
  balancesSol: num,
  unclaimedFeeTokenX: TokenAmount.nullish(),
  unclaimedFeeTokenY: TokenAmount.nullish(),
});

const PositionPnl = z.object({
  positionAddress: z.string(),
  isClosed: z.boolean(),
  createdAt: z.number().nullish(),
  closedAt: z.number().nullish(),
  lowerBinId: z.number(),
  upperBinId: z.number(),
  minPrice: num,
  maxPrice: num,
  poolActiveBinId: z.number().nullish(),
  isOutOfRange: z.boolean().nullish(),
  allTimeDeposits: Total,
  allTimeWithdrawals: Total,
  allTimeFees: Total,
  pnlSol: num,
  pnlUsd: num,
  unrealizedPnl: Unrealized.nullish(),
});
type PositionPnl = z.infer<typeof PositionPnl>;

const PnlPage = z.object({
  hasNext: z.boolean(),
  positions: z.array(PositionPnl),
  tokenX: z.string().nullish(),
  tokenY: z.string().nullish(),
});

const ClosedPool = z.object({
  poolAddress: z.string(),
  tokenX: z.string(),
  tokenY: z.string(),
  tokenXMint: z.string(),
  tokenYMint: z.string(),
  tokenXIcon: z.string().nullish(),
  tokenYIcon: z.string().nullish(),
  binStep: num,
  baseFee: num,
  lastClosedAt: z.number().nullish(),
});
const ClosedPage = z.object({ hasNext: z.boolean(), pools: z.array(ClosedPool) });

const OpenPool = z.object({
  poolAddress: z.string(),
  tokenX: z.string(),
  tokenY: z.string(),
  tokenXMint: z.string(),
  tokenYMint: z.string(),
  tokenXIcon: z.string().nullish(),
  tokenYIcon: z.string().nullish(),
  binStep: num,
  baseFee: num,
  poolPrice: num,
});
const OpenPage = z.object({ hasNext: z.boolean(), pools: z.array(OpenPool), solPrice: num });

const PoolToken = z.object({ is_verified: z.boolean().nullish(), price: num, total_supply: num, market_cap: num });
const PoolInfo = z.object({
  token_x: PoolToken,
  token_y: PoolToken,
  tvl: z.number().nullish(),
  dynamic_fee_pct: z.number().nullish(),
});

const History = z.object({
  events: z.array(
    z.object({
      signature: z.string(),
      ixIndex: z.number().nullish(),
      eventType: z.string(),
      blockTime: z.number(),
      amountX: num,
      amountY: num,
      amountXUsd: num,
      amountYUsd: num,
      totalUsd: num,
    }),
  ),
});

// The API returns seconds; accept milliseconds too so a change upstream cannot shift dates by 1000x.
const ms = (t: number) => (t < 1e12 ? t * 1000 : t);
const toMs = (t: number | null | undefined) => (t == null ? null : ms(t));

// The API answers with x-ratelimit-remaining / x-ratelimit-reset (epoch seconds). Every request
// shares this budget, and a 429 waits for the window to reset instead of failing the page.
const budget = { remaining: Number.POSITIVE_INFINITY, resetAt: 0 };
const MAX_ATTEMPTS = 6;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function get<T>(path: string, schema: z.ZodType<T>, params: Record<string, string | number>): Promise<T> {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 1; ; attempt++) {
    if (budget.remaining <= 0 && Date.now() < budget.resetAt) await sleep(budget.resetAt - Date.now() + 100);
    const res = await fetch(url, { headers: { accept: "application/json" } });
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    if (remaining !== null) budget.remaining = Number(remaining);
    if (reset !== null) budget.resetAt = Number(reset) * 1000;
    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      budget.remaining = 0;
      if (budget.resetAt <= Date.now()) budget.resetAt = Date.now() + 1000 * attempt;
      continue;
    }
    if (!res.ok) throw new Error(`Meteora API ${res.status} for ${url.pathname}`);
    return schema.parse(await res.json());
  }
}

async function allPages<T>(fetchPage: (page: number) => Promise<{ hasNext: boolean; items: T[] }>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; ; page++) {
    const { hasNext, items } = await fetchPage(page);
    out.push(...items);
    if (!hasNext || items.length === 0) return out;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const poolPositions = (pool: string, user: string, status: "open" | "closed") =>
  allPages(async (page) => {
    const r = await get(`/positions/${pool}/pnl`, PnlPage, { user, status, page, page_size: 100 });
    return { hasNext: r.hasNext, items: r.positions };
  });

const amounts = (p: PositionPnl, side: "sol" | "usd"): Amounts => ({
  deposit: p.allTimeDeposits.total[side],
  withdraw: p.allTimeWithdrawals.total[side],
  fees: p.allTimeFees.total[side],
  pnl: side === "sol" ? p.pnlSol : p.pnlUsd,
});

interface ClosedPoolInfo extends ClosedPoolRef {
  pair: string;
}

async function fetchPoolClosed(user: string, pool: ClosedPoolInfo): Promise<ClosedPosition[]> {
  const positions = await poolPositions(pool.pool, user, "closed");
  return positions.flatMap((p): ClosedPosition[] => {
    const closedAt = toMs(p.closedAt);
    if (!p.isClosed || closedAt === null) return [];
    return [
      {
        address: p.positionAddress,
        pool: pool.pool,
        pair: pool.pair,
        openedAt: toMs(p.createdAt) ?? closedAt,
        closedAt,
        sol: amounts(p, "sol"),
        usd: amounts(p, "usd"),
      },
    ];
  });
}

async function fetchClosedPools(user: string): Promise<{ pools: ClosedPoolInfo[]; closedPools: PoolMeta[] }> {
  const pools = await allPages(async (page) => {
    const r = await get("/portfolio", ClosedPage, { user, page, page_size: 1000, days_back: 365 });
    return { hasNext: r.hasNext, items: r.pools };
  });
  const token = (symbol: string, mint: string, icon: string | null | undefined): Token => ({
    symbol,
    mint,
    icon: icon || null,
    verified: false,
    priceUsd: null,
    organicScore: null,
    risks: null,
  });
  return {
    pools: pools.map((p) => ({
      pool: p.poolAddress,
      pair: `${p.tokenX}-${p.tokenY}`,
      lastClosedAt: p.lastClosedAt ?? null,
    })),
    closedPools: pools.map((p) => ({
      address: p.poolAddress,
      pair: `${p.tokenX}-${p.tokenY}`,
      tokenX: token(p.tokenX, p.tokenXMint, p.tokenXIcon),
      tokenY: token(p.tokenY, p.tokenYMint, p.tokenYIcon),
      binStep: p.binStep,
      baseFee: p.baseFee,
      // Closed pools have no live fee; like the reference UI, show the base fee in its place.
      dynamicFee: p.baseFee,
    })),
  };
}

const activeAmounts = (p: PositionPnl, side: "sol" | "usd"): ActiveAmounts => {
  const u = p.unrealizedPnl;
  const fee = side === "sol" ? "amountSol" : "usd";
  return {
    ...amounts(p, side),
    balance: (side === "sol" ? u?.balancesSol : u?.balances) ?? 0,
    unclaimed: (u?.unclaimedFeeTokenX?.[fee] ?? 0) + (u?.unclaimedFeeTokenY?.[fee] ?? 0),
  };
};

async function fetchActive(user: string): Promise<{ active: ActivePool[]; solPrice: number | null }> {
  let solPrice: number | null = null;
  const pools = await allPages(async (page) => {
    const r = await get("/portfolio/open", OpenPage, { user, page, page_size: 50 });
    solPrice = r.solPrice || solPrice;
    return { hasNext: r.hasNext, items: r.pools };
  });
  const perPool = await mapLimit(pools, CONCURRENCY, async (pool): Promise<ActivePool[]> => {
    const [positions, info] = await Promise.all([
      poolPositions(pool.poolAddress, user, "open"),
      // Pool stats only decorate the row (FDV, TVL, dynamic fee); a failure must not lose the positions.
      get(`/pools/${pool.poolAddress}`, PoolInfo, {}).catch(() => null),
    ]);
    if (positions.length === 0) return [];
    const pair = `${pool.tokenX}-${pool.tokenY}`;
    const x = info?.token_x;
    return [
      {
        address: pool.poolAddress,
        pair,
        tokenX: {
          symbol: pool.tokenX,
          mint: pool.tokenXMint,
          icon: pool.tokenXIcon || null,
          verified: x?.is_verified ?? false,
          priceUsd: x?.price || null,
          organicScore: null,
          risks: null,
        },
        tokenY: {
          symbol: pool.tokenY,
          mint: pool.tokenYMint,
          icon: pool.tokenYIcon || null,
          verified: info?.token_y.is_verified ?? false,
          priceUsd: info?.token_y.price || null,
          organicScore: null,
          risks: null,
        },
        binStep: pool.binStep,
        baseFee: pool.baseFee,
        dynamicFee: info?.dynamic_fee_pct ?? null,
        price: pool.poolPrice,
        activeBin: positions[0]?.poolActiveBinId ?? null,
        fdv: x ? x.price * x.total_supply || x.market_cap || null : null,
        tvl: info?.tvl ?? null,
        positions: positions
          .map(
            (p): ActivePosition => ({
              address: p.positionAddress,
              pool: pool.poolAddress,
              pair,
              openedAt: toMs(p.createdAt),
              lowerBin: p.lowerBinId,
              upperBin: p.upperBinId,
              minPrice: p.minPrice,
              maxPrice: p.maxPrice,
              inRange: p.isOutOfRange == null ? null : !p.isOutOfRange,
              sol: activeAmounts(p, "sol"),
              usd: activeAmounts(p, "usd"),
            }),
          )
          .sort((a, b) => (a.openedAt ?? 0) - (b.openedAt ?? 0)),
      },
    ];
  });
  return { active: perPool.flat(), solPrice };
}

/** One Jupiter lookup for every token on the page; concurrent lookups get rate limited. */
async function addTokenInfo(pools: PoolMeta[]) {
  const tokens = pools.flatMap((p) => [p.tokenX, p.tokenY]);
  const info = await loadTokenInfo(tokens.map((t) => t.mint));
  for (const token of tokens) {
    const t = info.get(token.mint);
    if (!t) continue;
    token.organicScore = t.organicScore;
    token.risks = t.risks;
    token.verified ||= t.verified === true;
  }
}

// /portfolio only lists pools with a close in the last 365 days; this total covers every closed position.
const AllTime = z.object({ totalClosedPositions: z.number(), totalPnlSol: num, totalPnlUsd: num });

function cached<T>(store: Map<string, { at: number; value: Promise<T> }>, key: string, load: () => Promise<T>) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = load();
  value.catch(() => store.delete(key));
  store.set(key, { at: Date.now(), value });
  return value;
}

/** Everything on the page except the closed positions themselves. */
type BaseSnapshot = Omit<Portfolio, "closed" | "closedProgress"> & { pools: ClosedPoolInfo[] };

const bases = new Map<string, { at: number; value: Promise<BaseSnapshot> }>();

const fetchBase = (wallet: string): Promise<BaseSnapshot> =>
  Promise.all([fetchClosedPools(wallet), fetchActive(wallet), get("/portfolio/total", AllTime, { user: wallet })]).then(
    async ([{ pools, closedPools }, { active, solPrice }, allTime]) => {
      await addTokenInfo([...closedPools, ...active]);
      return {
        wallet,
        fetchedAt: Date.now(),
        solPrice,
        pools,
        closedPools,
        active,
        allTime: {
          closedPositions: allTime.totalClosedPositions,
          sol: allTime.totalPnlSol,
          usd: allTime.totalPnlUsd,
        },
      };
    },
  );

function loadBase(wallet: string): Promise<BaseSnapshot> {
  const hit = bases.get(wallet);
  // A refresh mid-job would queue behind the job on the shared rate-limit budget.
  if (hit && closedJobs.has(wallet)) return hit.value;
  return cached(bases, wallet, () => fetchBase(wallet));
}

const CACHE_DIR = process.env.VEXIS_CACHE_DIR ?? "../../.state/portfolio-cache";
const SAVE_EVERY = 50;
const poolCaches = new Map<string, Promise<PoolCache>>();
const closedJobs = new Map<string, Promise<void>>();
// One job per base snapshot, so pools that failed wait for the next refresh instead of retrying on every poll.
const jobStarted = new WeakSet<BaseSnapshot>();

function loadPoolCache(wallet: string): Promise<PoolCache> {
  let cache = poolCaches.get(wallet);
  if (!cache) {
    cache = readPoolCache(CACHE_DIR, wallet);
    poolCaches.set(wallet, cache);
  }
  return cache;
}

/** Fetches the wallet's stale pools in the background; returns the job already running, if any. */
function startClosedJob(base: BaseSnapshot, cache: PoolCache): Promise<void> {
  const { wallet } = base;
  const running = closedJobs.get(wallet);
  if (running) return running;
  if (jobStarted.has(base)) return Promise.resolve();
  jobStarted.add(base);
  const stale = stalePools(base.pools, cache);
  if (stale.length === 0) return Promise.resolve();
  let saving = Promise.resolve();
  const save = () => {
    saving = saving
      .then(() => writePoolCache(CACHE_DIR, wallet, cache))
      .catch((err) => console.error(`portfolio cache write failed for ${wallet}`, err));
    return saving;
  };
  let done = 0;
  const job = mapLimit(stale, CONCURRENCY, async (pool) => {
    try {
      cache.set(pool.pool, { lastClosedAt: pool.lastClosedAt, positions: await fetchPoolClosed(wallet, pool) });
      if (++done % SAVE_EVERY === 0) void save();
    } catch (err) {
      console.error(`closed positions failed for pool ${pool.pool}`, err);
    }
  })
    .then(save)
    .finally(() => closedJobs.delete(wallet));
  closedJobs.set(wallet, job);
  return job;
}

async function snapshot(wallet: string) {
  const [base, cache] = await Promise.all([loadBase(wallet), loadPoolCache(wallet)]);
  const job = startClosedJob(base, cache);
  return { base, cache, job };
}

function compose({ pools, ...base }: BaseSnapshot, cache: PoolCache): Portfolio {
  return {
    ...base,
    closed: pools.flatMap((p) => cache.get(p.pool)?.positions ?? []).sort((a, b) => a.closedAt - b.closedAt),
    closedProgress: {
      loaded: freshCount(pools, cache),
      total: pools.length,
      running: closedJobs.has(base.wallet),
    },
  };
}

/** Returns once the base snapshot is ready, with whatever closed positions are cached so far. */
export async function loadPortfolio(wallet: string): Promise<Portfolio> {
  const { base, cache } = await snapshot(wallet);
  return compose(base, cache);
}

const activities = new Map<string, { at: number; value: Promise<PositionEvent[]> }>();

async function fetchActivity(position: string): Promise<PositionEvent[]> {
  const r = await get(`/positions/${position}/historical`, History, { order_direction: "asc" });
  return r.events.map((e) => ({
    id: `${e.signature}:${e.ixIndex ?? 0}:${e.eventType}`,
    signature: e.signature,
    type: e.eventType,
    at: ms(e.blockTime),
    amountX: e.amountX,
    amountY: e.amountY,
    amountXUsd: e.amountXUsd,
    amountYUsd: e.amountYUsd,
    totalUsd: e.totalUsd,
  }));
}

/** Every event on a position, oldest first. */
export const loadActivity = (position: string): Promise<PositionEvent[]> =>
  cached(activities, position, () => fetchActivity(position));

const HISTORY_SAVE_EVERY = 200;
const HISTORY_IDLE_MS = 2000;
const historyCaches = new Map<string, Promise<HistoryCache>>();
const historyJobs = new Map<string, Promise<void>>();
const historyStarted = new WeakSet<BaseSnapshot>();
// Active positions keep changing, so their events stay in memory and every job refetches them.
const activeHistories = new Map<string, Map<string, PositionEvent[]>>();

function loadHistoryCache(wallet: string): Promise<HistoryCache> {
  let cache = historyCaches.get(wallet);
  if (!cache) {
    cache = readHistoryCache(CACHE_DIR, wallet);
    historyCaches.set(wallet, cache);
  }
  return cache;
}

function historyRefs({ pools, active }: BaseSnapshot, cache: PoolCache) {
  return {
    active: active.flatMap((pool) =>
      pool.positions.map(
        (p): HistoryRef => ({ position: p.address, pool: p.pool, openedAt: p.openedAt, closedAt: null }),
      ),
    ),
    closed: pools
      .flatMap((p) => cache.get(p.pool)?.positions ?? [])
      .map((p): HistoryRef => ({ position: p.address, pool: p.pool, openedAt: p.openedAt, closedAt: p.closedAt })),
  };
}

/**
 * Fetches position histories in the background, newest first. It keeps going while the closed job
 * runs, picking up positions as that job discovers them; a failed position waits for the next job.
 */
function startHistoryJob(base: BaseSnapshot, pools: PoolCache, history: HistoryCache) {
  const { wallet } = base;
  if (historyJobs.has(wallet) || historyStarted.has(base)) return;
  historyStarted.add(base);
  const activeEvents = activeHistories.get(wallet) ?? new Map<string, PositionEvent[]>();
  activeHistories.set(wallet, activeEvents);
  let unsaved = 0;
  let saving = Promise.resolve();
  // Each save rewrites the whole file, so saving every 200 positions keeps a 2,600-position wallet to about 13 writes.
  const save = () => {
    unsaved = 0;
    saving = saving
      .then(() => writeHistoryCache(CACHE_DIR, wallet, history))
      .catch((err) => console.error(`transaction history write failed for ${wallet}`, err));
    return saving;
  };
  const tried = new Set<string>();
  const fetchOne = async (ref: HistoryRef) => {
    tried.add(ref.position);
    try {
      const events = await fetchActivity(ref.position);
      if (ref.closedAt === null) activeEvents.set(ref.position, events);
      else {
        history.set(ref.position, events);
        if (++unsaved >= HISTORY_SAVE_EVERY) void save();
      }
    } catch (err) {
      console.error(`history failed for position ${ref.position}`, err);
    }
  };
  const run = async () => {
    for (;;) {
      const refs = historyRefs(base, pools);
      const queue = historyQueue(refs.active, refs.closed, history, tried);
      if (queue.length > 0) {
        await mapLimit(queue, CONCURRENCY, fetchOne);
        continue;
      }
      const closedJob = closedJobs.get(wallet);
      if (!closedJob) return;
      await Promise.race([closedJob, sleep(HISTORY_IDLE_MS)]);
    }
  };
  const job = run()
    .catch((err) => console.error(`transaction history job failed for ${wallet}`, err))
    .then(() => (unsaved > 0 ? save() : undefined))
    .finally(() => historyJobs.delete(wallet));
  historyJobs.set(wallet, job);
}

/**
 * Returns at once with the histories fetched so far. Meteora has no wallet-wide endpoint, so a
 * background job fetches one position at a time; closed pools the closed job has not reached yet
 * are not counted in `total`.
 */
export async function loadTransactions(wallet: string): Promise<Transactions> {
  const [{ base, cache }, history] = await Promise.all([snapshot(wallet), loadHistoryCache(wallet)]);
  startHistoryJob(base, cache, history);
  const refs = historyRefs(base, cache);
  const { histories, total } = collectHistories(
    refs.active,
    refs.closed,
    activeHistories.get(wallet) ?? new Map(),
    history,
  );
  return {
    histories,
    progress: { loaded: histories.length, total, running: historyJobs.has(wallet) || closedJobs.has(wallet) },
  };
}
