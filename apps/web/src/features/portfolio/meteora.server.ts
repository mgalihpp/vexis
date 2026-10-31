import { z } from "zod";
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
} from "./portfolio";
import { loadTokenInfo } from "./prices.server";

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

async function get<T>(path: string, schema: z.ZodType<T>, params: Record<string, string | number>): Promise<T> {
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

async function fetchClosed(user: string): Promise<{ closed: ClosedPosition[]; closedPools: PoolMeta[] }> {
  const pools = await allPages(async (page) => {
    const r = await get("/portfolio", ClosedPage, { user, page, page_size: 1000, days_back: 365 });
    return { hasNext: r.hasNext, items: r.pools };
  });
  const perPool = await mapLimit(pools, CONCURRENCY, async (pool) => {
    // Closed positions never change, so a pool is refetched only when it has a newer close.
    const key = `${user}:${pool.poolAddress}`;
    const hit = closedByPool.get(key);
    if (hit && hit.lastClosedAt === pool.lastClosedAt) return hit.positions;
    const positions = await poolPositions(pool.poolAddress, user, "closed");
    const mapped = positions.flatMap((p): ClosedPosition[] => {
      const closedAt = toMs(p.closedAt);
      if (!p.isClosed || closedAt === null) return [];
      return [
        {
          address: p.positionAddress,
          pool: pool.poolAddress,
          pair: `${pool.tokenX}-${pool.tokenY}`,
          openedAt: toMs(p.createdAt) ?? closedAt,
          closedAt,
          sol: amounts(p, "sol"),
          usd: amounts(p, "usd"),
        },
      ];
    });
    closedByPool.set(key, { lastClosedAt: pool.lastClosedAt, positions: mapped });
    return mapped;
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
    closed: perPool.flat().sort((a, b) => a.closedAt - b.closedAt),
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

const closedByPool = new Map<string, { lastClosedAt: number | null | undefined; positions: ClosedPosition[] }>();

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

const portfolios = new Map<string, { at: number; value: Promise<Portfolio> }>();

export const loadPortfolio = (wallet: string): Promise<Portfolio> =>
  cached(portfolios, wallet, () =>
    Promise.all([fetchClosed(wallet), fetchActive(wallet), get("/portfolio/total", AllTime, { user: wallet })]).then(
      async ([{ closed, closedPools }, { active, solPrice }, allTime]) => {
        await addTokenInfo([...closedPools, ...active]);
        return {
          wallet,
          fetchedAt: Date.now(),
          solPrice,
          closed,
          closedPools,
          active,
          allTime: {
            closedPositions: allTime.totalClosedPositions,
            sol: allTime.totalPnlSol,
            usd: allTime.totalPnlUsd,
          },
        };
      },
    ),
  );

const activities = new Map<string, { at: number; value: Promise<PositionEvent[]> }>();

/** Every event on a position, oldest first. */
export const loadActivity = (position: string): Promise<PositionEvent[]> =>
  cached(activities, position, async () => {
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
  });
