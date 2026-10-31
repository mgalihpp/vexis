import { z } from "zod";
import type { ActiveAmounts, ActivePosition, Amounts, ClosedPosition, Portfolio } from "./portfolio";

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

const PositionPnl = z.object({
  positionAddress: z.string(),
  isClosed: z.boolean(),
  createdAt: z.number().nullish(),
  closedAt: z.number().nullish(),
  lowerBinId: z.number(),
  upperBinId: z.number(),
  isOutOfRange: z.boolean().nullish(),
  allTimeDeposits: Total,
  allTimeWithdrawals: Total,
  allTimeFees: Total,
  pnlSol: num,
  pnlUsd: num,
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
  lastClosedAt: z.number().nullish(),
});
const ClosedPage = z.object({ hasNext: z.boolean(), pools: z.array(ClosedPool) });

const OpenPool = z.object({
  poolAddress: z.string(),
  tokenX: z.string(),
  tokenY: z.string(),
  listPositions: z.array(z.string()),
  balances: num,
  balancesSol: num,
  unclaimedFees: num,
  unclaimedFeesSol: num,
});
const OpenPage = z.object({ hasNext: z.boolean(), pools: z.array(OpenPool), solPrice: num });

// The API returns seconds; accept milliseconds too so a change upstream cannot shift dates by 1000x.
const toMs = (t: number | null | undefined) => (t == null ? null : t < 1e12 ? t * 1000 : t);

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

async function fetchClosed(user: string): Promise<ClosedPosition[]> {
  const pools = await allPages(async (page) => {
    const r = await get("/portfolio", ClosedPage, { user, page, page_size: 50, days_back: 365 });
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
  return perPool.flat().sort((a, b) => a.closedAt - b.closedAt);
}

const closedByPool = new Map<string, { lastClosedAt: number | null | undefined; positions: ClosedPosition[] }>();

async function fetchActive(user: string): Promise<{ active: ActivePosition[]; solPrice: number | null }> {
  let solPrice: number | null = null;
  const pools = await allPages(async (page) => {
    const r = await get("/portfolio/open", OpenPage, { user, page, page_size: 50 });
    solPrice = r.solPrice || solPrice;
    return { hasNext: r.hasNext, items: r.pools };
  });
  const perPool = await mapLimit(pools, CONCURRENCY, async (pool) => {
    const positions = await poolPositions(pool.poolAddress, user, "open");
    const share = 1 / Math.max(positions.length, 1);
    // The API reports balance and unclaimed fees per pool only; split them evenly across its positions.
    const extra = (side: "sol" | "usd", p: PositionPnl): ActiveAmounts => ({
      ...amounts(p, side),
      balance: (side === "sol" ? pool.balancesSol : pool.balances) * share,
      unclaimed: (side === "sol" ? pool.unclaimedFeesSol : pool.unclaimedFees) * share,
    });
    return positions.map(
      (p): ActivePosition => ({
        address: p.positionAddress,
        pool: pool.poolAddress,
        pair: `${pool.tokenX}-${pool.tokenY}`,
        openedAt: toMs(p.createdAt),
        lowerBin: p.lowerBinId,
        upperBin: p.upperBinId,
        inRange: p.isOutOfRange == null ? null : !p.isOutOfRange,
        sol: extra("sol", p),
        usd: extra("usd", p),
      }),
    );
  });
  return { active: perPool.flat(), solPrice };
}

// /portfolio only lists pools with a close in the last 365 days; this total covers every closed position.
const AllTime = z.object({ totalClosedPositions: z.number(), totalPnlSol: num, totalPnlUsd: num });

const cache = new Map<string, { at: number; value: Promise<Portfolio> }>();

export function loadPortfolio(wallet: string): Promise<Portfolio> {
  const hit = cache.get(wallet);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = Promise.all([
    fetchClosed(wallet),
    fetchActive(wallet),
    get("/portfolio/total", AllTime, { user: wallet }),
  ]).then(([closed, { active, solPrice }, allTime]) => ({
    wallet,
    fetchedAt: Date.now(),
    solPrice,
    closed,
    active,
    allTime: { closedPositions: allTime.totalClosedPositions, sol: allTime.totalPnlSol, usd: allTime.totalPnlUsd },
  }));
  value.catch(() => cache.delete(wallet));
  cache.set(wallet, { at: Date.now(), value });
  return value;
}
