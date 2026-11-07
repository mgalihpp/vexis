import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadPrices } from "../portfolio/prices.server";
import { poolTokens } from "./analytics.server";
import { type Cache, cached } from "./cache.server";
import {
  groupFlows,
  type KnownWallet,
  knownWallets,
  type PoolTrade,
  parseGeckoTrades,
  parseTraders,
  parseTrades,
  pickTraderMint,
  type TraderStats,
  type TradersResult,
  tagTrades,
  toTopTraders,
  unionTraders,
} from "./traders";

const TRACKER = "https://data.solanatracker.io";
const GECKO = "https://api.geckoterminal.com/api/v2/networks/solana/pools";
const TIMEOUT_MS = 15_000;

// GeckoTerminal is free and keyless (about 30 requests a minute per IP), so recent trades stay close to live.
const TRADES_MS = 60_000;

// Solana Tracker's free plan is 2,500 requests a month, spread here over a 31-day month. One token's lists cost
// LIST_REQUESTS (trader list by invested, by PnL, KOL trades) and are kept a day, so about 26 new tokens a day fit.
const LISTS_MS = 24 * 60 * 60_000;
const LIST_REQUESTS = 3;
const DAILY_LIMIT = 80;
const KEEP_MS = 7 * LISTS_MS;
const STORE_FILE = resolve(process.env.VEXIS_CACHE_DIR ?? "../../.state/portfolio-cache", "..", "solana-tracker.json");

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
  const res = await fetch(`${TRACKER}${path}?${query}`, {
    headers: { "x-api-key": key },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Solana Tracker ${path.split("/")[1]} ${res.status}`);
  return res.json();
}

interface Lists {
  at: number;
  traders: TraderStats[];
  kolTrades: PoolTrade[];
  kolOk: boolean;
}

interface Store {
  version: 1;
  /** Requests sent on one UTC day. */
  usage: { day: string; used: number };
  lists: Record<string, Lists>;
  wallets: Record<string, KnownWallet>;
}

const today = () => new Date().toISOString().slice(0, 10);
const emptyStore = (): Store => ({ version: 1, usage: { day: today(), used: 0 }, lists: {}, wallets: {} });

let store: Promise<Store> | undefined;

/** Read once; a missing, corrupt or other-version file starts empty. */
function loadStore(): Promise<Store> {
  store ??= readFile(STORE_FILE, "utf8")
    .then((text) => {
      const json = JSON.parse(text);
      return json?.version === 1 ? (json as Store) : emptyStore();
    })
    .catch(() => emptyStore());
  return store;
}

let saving = Promise.resolve();
function save(s: Store) {
  saving = saving
    .then(async () => {
      for (const [mint, l] of Object.entries(s.lists)) if (Date.now() - l.at > KEEP_MS) delete s.lists[mint];
      await mkdir(dirname(STORE_FILE), { recursive: true });
      const tmp = `${STORE_FILE}.tmp`;
      await writeFile(tmp, JSON.stringify(s));
      await rename(tmp, STORE_FILE);
    })
    .catch((err) => console.error("[traders] store write failed", err));
}

/** Counts `n` requests against today's budget, or refuses without counting. */
function spend(s: Store, n: number) {
  if (s.usage.day !== today()) s.usage = { day: today(), used: 0 };
  if (s.usage.used + n > DAILY_LIMIT) return false;
  s.usage.used += n;
  return true;
}

async function fetchLists(s: Store, mint: string): Promise<Lists> {
  const path = `/v2/pnl/tokens/${mint}/traders`;
  const [invested, pnl, kolTrades] = await Promise.all([
    tracker(path, { sort: "invested", direction: "desc", limit: 100 }),
    tracker(path, { sort: "pnl", direction: "desc", limit: 50 }),
    tracker(`/trades/kols/${mint}`, { limit: 100 }).then(
      (json) => parseTrades(json, true),
      (err: unknown) => {
        console.warn("[traders]", err instanceof Error ? err.message : err);
        return null;
      },
    ),
  ]);
  const lists = {
    at: Date.now(),
    traders: unionTraders(parseTraders(invested), parseTraders(pnl)),
    kolTrades: kolTrades ?? [],
    kolOk: kolTrades != null,
  };
  s.lists[mint] = lists;
  s.wallets = knownWallets(s.wallets, lists.traders, lists.kolTrades);
  return lists;
}

const inflight = new Map<string, Promise<Lists>>();

/** A day-old copy is served as is; past the budget or on a failure, the last copy (if any) stands in. */
async function tokenLists(mint: string): Promise<{ lists: Lists | null; quota: boolean }> {
  const s = await loadStore();
  const hit = s.lists[mint];
  if (hit && Date.now() - hit.at < LISTS_MS) return { lists: hit, quota: false };
  let job = inflight.get(mint);
  if (!job) {
    const allowed = spend(s, LIST_REQUESTS);
    save(s);
    if (!allowed) return { lists: hit ?? null, quota: true };
    job = fetchLists(s, mint).finally(() => {
      inflight.delete(mint);
      save(s);
    });
    inflight.set(mint, job);
  }
  try {
    return { lists: await job, quota: false };
  } catch (err) {
    console.warn("[traders]", err instanceof Error ? err.message : err);
    return { lists: hit ?? null, quota: false };
  }
}

const tradesCache: Cache<{ at: number; trades: PoolTrade[] }> = new Map();

const recentTrades = (mint: string, pool: string, solUsd: number | null) =>
  cached(tradesCache, pool, TRADES_MS, async () => {
    const res = await fetch(`${GECKO}/${pool}/trades`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`GeckoTerminal trades ${res.status}`);
    return { at: Date.now(), trades: parseGeckoTrades(await res.json(), mint, solUsd).slice(0, 100) };
  });

export async function loadTraders(pool: string): Promise<TradersResult> {
  const unavailable: TradersResult = {
    ok: false,
    reason: "unavailable",
    message: "Trader data could not be loaded. Try again shortly.",
  };
  const [tokens, prices] = await Promise.all([poolTokens(pool), loadPrices()]);
  if (!tokens) return unavailable;
  const { mint, topOffered } = pickTraderMint(tokens.mints.x, tokens.mints.y);
  const symbol = mint === tokens.mints.x ? tokens.x.symbol : tokens.y.symbol;
  const hasKey = !!process.env.SOLANA_TRACKER_API_KEY;

  const [trades, listed, s] = await Promise.all([
    recentTrades(mint, pool, prices.sol).catch((err: unknown) => {
      console.warn("[traders]", err instanceof Error ? err.message : err);
      return null;
    }),
    topOffered && hasKey ? tokenLists(mint) : null,
    loadStore(),
  ]);
  if (!trades) return unavailable;

  const lists = listed?.lists ?? null;
  const traders = lists ? toTopTraders(lists.traders, lists.kolTrades, prices.sol) : null;
  return {
    ok: true,
    mint,
    symbol,
    trades: tagTrades(trades.trades, traders, s.wallets),
    top: traders,
    topError: listed != null && lists == null && !listed.quota,
    groups: traders ? groupFlows(traders, prices.sol) : null,
    listed: lists?.traders.length ?? 0,
    kolError: lists != null && !lists.kolOk,
    listsAt: lists?.at ?? null,
    limit: !topOffered ? null : !hasKey ? "no_key" : listed?.quota ? "quota" : null,
    fetchedAt: trades.at,
  };
}
