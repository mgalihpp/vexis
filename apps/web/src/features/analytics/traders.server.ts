import { loadPrices } from "../portfolio/prices.server";
import { poolTokens } from "./analytics.server";
import { type Cache, cached } from "./cache.server";
import {
  groupFlows,
  type PoolTrade,
  parseTraders,
  parseTrades,
  pickTraderMint,
  type TraderStats,
  type TradersResult,
  tagTrades,
  toTopTraders,
  unionTraders,
} from "./traders";

const API = "https://data.solanatracker.io";
const TIMEOUT_MS = 15_000;

// The free plan allows 2,500 requests a month. One pool viewed nonstop costs about 12 trade, 4 KOL and 2 trader
// requests an hour (two sorts an hour); the trader lists and KOL trades are per mint, shared by its pools.
const TRADES_MS = 5 * 60_000;
const KOL_MS = 15 * 60_000;
const TOP_MS = 60 * 60_000;

// The plan also allows 3 requests a second, so requests leave at least this far apart.
const SPACING_MS = 350;
let nextSlot = 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tracker(path: string, params: Record<string, string | number | boolean>): Promise<unknown> {
  const key = process.env.SOLANA_TRACKER_API_KEY;
  if (!key) throw new Error("SOLANA_TRACKER_API_KEY is not set");
  const slot = Math.max(nextSlot, Date.now());
  nextSlot = slot + SPACING_MS;
  await sleep(slot - Date.now());
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${API}${path}?${query}`, {
    headers: { "x-api-key": key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Solana Tracker ${path.split("/")[1]} ${res.status}`);
  return res.json();
}

const tradesCache: Cache<{ at: number; trades: PoolTrade[] }> = new Map();
const kolCache: Cache<PoolTrade[]> = new Map();
const topCache: Cache<TraderStats[]> = new Map();

const recentTrades = (mint: string, pool: string) =>
  cached(tradesCache, `${mint}:${pool}`, TRADES_MS, async () => {
    const json = await tracker(`/trades/${mint}/${pool}`, { enrich: "identity", hideArb: true, limit: 100 });
    return { at: Date.now(), trades: parseTrades(json) };
  });

const kolTrades = (mint: string) =>
  cached(kolCache, mint, KOL_MS, async () => parseTrades(await tracker(`/trades/kols/${mint}`, { limit: 100 }), true));

/** The biggest buyers (including wallets that sold out) and the most profitable traders, one list by wallet. */
const topTraders = (mint: string) =>
  cached(topCache, mint, TOP_MS, async () => {
    const path = `/v2/pnl/tokens/${mint}/traders`;
    const [invested, pnl] = await Promise.all([
      tracker(path, { sort: "invested", direction: "desc", limit: 100 }),
      tracker(path, { sort: "pnl", direction: "desc", limit: 50 }),
    ]);
    return unionTraders(parseTraders(invested), parseTraders(pnl));
  });

const settle = <T>(p: Promise<T> | null) =>
  p
    ? p.then(
        (value) => ({ value }),
        (err: unknown) => {
          console.warn("[traders]", err instanceof Error ? err.message : err);
          return { value: null };
        },
      )
    : Promise.resolve(null);

export async function loadTraders(pool: string): Promise<TradersResult> {
  if (!process.env.SOLANA_TRACKER_API_KEY) {
    return { ok: false, reason: "no_key", message: "Trader data is not configured on this server." };
  }
  const unavailable: TradersResult = {
    ok: false,
    reason: "unavailable",
    message: "Trader data could not be loaded. Try again shortly.",
  };
  const tokens = await poolTokens(pool);
  if (!tokens) return unavailable;
  const { mint, topOffered } = pickTraderMint(tokens.mints.x, tokens.mints.y);
  const symbol = mint === tokens.mints.x ? tokens.x.symbol : tokens.y.symbol;

  const [trades, top, kols, prices] = await Promise.all([
    settle(recentTrades(mint, pool)),
    settle(topOffered ? topTraders(mint) : null),
    settle(topOffered ? kolTrades(mint) : null),
    loadPrices(),
  ]);
  if (!trades?.value) return unavailable;

  const listed = top?.value ?? null;
  const traders = listed ? toTopTraders(listed, kols?.value ?? [], prices.sol) : null;
  return {
    ok: true,
    mint,
    symbol,
    trades: tagTrades(trades.value.trades, traders),
    top: traders,
    topError: topOffered && listed == null,
    groups: traders ? groupFlows(traders, prices.sol) : null,
    listed: listed?.length ?? 0,
    kolError: topOffered && kols?.value == null,
    fetchedAt: trades.value.at,
  };
}
