import { z } from "zod";
import { sumKnown } from "./tracked";

export interface KolIdentity {
  name: string;
  twitter: string | null;
}

export interface TraderIdentity {
  kol: KolIdentity | null;
  bot: boolean;
}

export const WHALE_TRADE_USD = 10_000;
export const WHALE_HOLD_USD = 50_000;
export const SMART_LIFETIME_USD = 100_000;

export type TraderTag =
  | { kind: "kol"; name: string; twitter: string | null }
  | { kind: "whale" }
  | { kind: "smart"; lifetimePnlUsd: number }
  | { kind: "bot" };

export interface Amount {
  usd: number | null;
  sol: number | null;
}

export interface PoolTrade {
  tx: string;
  side: "buy" | "sell";
  wallet: string;
  time: number;
  amount: number | null;
  usd: number | null;
  sol: number | null;
  identity: TraderIdentity;
}

export type TradeRow = PoolTrade & { tags: TraderTag[] };

export type HoldStatus = "holding" | "partial" | "sold" | "rebought";

export interface TopTrader {
  wallet: string;
  tokenPnl: Amount;
  holding: Amount;
  bought: Amount;
  sold: Amount;
  lifetimePnlUsd: number | null;
  trades: number | null;
  buys: number | null;
  sells: number | null;
  /** Token units still held. */
  balance: number | null;
  lastTrade: number | null;
  lastBuy: number | null;
  lastSell: number | null;
  status: HoldStatus | null;
  identity: TraderIdentity;
  tags: TraderTag[];
}

export type GroupKind = "kol" | "whale" | "smart";
export const GROUP_KINDS: readonly GroupKind[] = ["kol", "whale", "smart"];

export interface GroupFlow {
  kind: GroupKind;
  wallets: number;
  buyers: number;
  sellers: number;
  buyUsd: number | null;
  sellUsd: number | null;
  netUsd: number | null;
  buySol: number | null;
  sellSol: number | null;
  netSol: number | null;
  holding: number;
  partial: number;
  sold: number;
  rebought: number;
  unknown: number;
}

export type TradersResult =
  | {
      ok: true;
      mint: string;
      symbol: string;
      trades: TradeRow[];
      /** Null when the pool has no non-quote token, or when the trader lists failed (`topError`). */
      top: TopTrader[] | null;
      topError: boolean;
      groups: GroupFlow[] | null;
      /** Wallets the two trader lists returned, before KOL-only wallets are added. */
      listed: number;
      kolError: boolean;
      fetchedAt: number;
    }
  | { ok: false; reason: "no_key" | "unavailable"; message: string };

// wSOL, USDC, USDT. Trader PnL for a quote token says nothing about the pool.
export const QUOTE_MINTS: ReadonlySet<string> = new Set([
  "So11111111111111111111111111111111111111112",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
]);

/** The pool's non-quote side. Both sides quotes: trades still work (they are pool-scoped), top traders do not. */
export function pickTraderMint(tokenX: string, tokenY: string): { mint: string; topOffered: boolean } {
  if (!QUOTE_MINTS.has(tokenX)) return { mint: tokenX, topOffered: true };
  return { mint: tokenY, topOffered: !QUOTE_MINTS.has(tokenY) };
}

interface TagInput {
  identity: TraderIdentity;
  /** One swap in recent trades, or everything a trader bought in the trader lists. */
  tradeUsd: number | null;
  holdingUsd: number | null;
  lifetimePnlUsd: number | null;
}

// In display order. A rule with an unknown input yields no tag.
const TAG_RULES: readonly ((i: TagInput) => TraderTag | null)[] = [
  ({ identity }) => (identity.kol ? { kind: "kol", ...identity.kol } : null),
  ({ tradeUsd, holdingUsd }) =>
    (tradeUsd ?? 0) >= WHALE_TRADE_USD || (holdingUsd ?? 0) >= WHALE_HOLD_USD ? { kind: "whale" } : null,
  ({ lifetimePnlUsd }) =>
    lifetimePnlUsd != null && lifetimePnlUsd >= SMART_LIFETIME_USD ? { kind: "smart", lifetimePnlUsd } : null,
  ({ identity }) => (identity.bot ? { kind: "bot" } : null),
];

export const traderTags = (input: TagInput): TraderTag[] => TAG_RULES.flatMap((rule) => rule(input) ?? []);

/** No kinds means every wallet; several kinds match a wallet carrying any of them. */
export type TradeFilter = { kinds: ReadonlySet<GroupKind>; hideBots: boolean };

export function tradeFilter(tags: readonly TraderTag[], filter: TradeFilter): boolean {
  if (filter.hideBots && tags.some((t) => t.kind === "bot")) return false;
  return filter.kinds.size === 0 || tags.some((t) => t.kind !== "bot" && filter.kinds.has(t.kind));
}

const ZERO_SHARE = 1e-9;

export function holdStatus(input: {
  balance: number | null;
  tokensBought?: number | null;
  sells: number | null;
  lastBuy: number | null;
  lastSell: number | null;
}): HoldStatus | null {
  const { balance, tokensBought, sells, lastBuy, lastSell } = input;
  if (balance == null || sells == null) return null;
  const zero = balance <= 0 || (tokensBought != null && tokensBought > 0 && balance < tokensBought * ZERO_SHARE);
  if (zero) return sells > 0 ? "sold" : null;
  if (sells === 0) return "holding";
  return lastBuy != null && lastSell != null && lastBuy > lastSell ? "rebought" : "partial";
}

/** Every group whose tag a wallet has counts it once. Bots are left out of every group. */
export function groupFlows(traders: readonly TopTrader[], solUsd: number | null): GroupFlow[] {
  const toSol = (usd: number | null) => (usd == null || solUsd == null || solUsd <= 0 ? null : usd / solUsd);
  return GROUP_KINDS.map((kind) => {
    const members = traders.filter((t) => tradeFilter(t.tags, { kinds: new Set([kind]), hideBots: true }));
    const buyUsd = sumKnown(members.map((t) => t.bought.usd));
    const sellUsd = sumKnown(members.map((t) => t.sold.usd));
    const netUsd = buyUsd == null || sellUsd == null ? null : buyUsd - sellUsd;
    const count = (s: HoldStatus | null) => members.filter((t) => t.status === s).length;
    return {
      kind,
      wallets: members.length,
      buyers: members.filter((t) => (t.buys ?? 0) > 0 || (t.bought.usd ?? 0) > 0).length,
      sellers: members.filter((t) => (t.sells ?? 0) > 0 || (t.sold.usd ?? 0) > 0).length,
      buyUsd,
      sellUsd,
      netUsd,
      buySol: toSol(buyUsd),
      sellSol: toSol(sellUsd),
      netSol: toSol(netUsd),
      holding: count("holding"),
      partial: count("partial"),
      sold: count("sold"),
      rebought: count("rebought"),
      unknown: count(null),
    };
  });
}

// Solana Tracker boundary. Every field is nullish-tolerant and only the fields the section reads are kept.

const num = z.number().nullish();
const text = z.string().nullish();

const Identity = z
  .object({
    name: text,
    twitter: text,
    tags: z.array(z.string()).nullish(),
    kol: z.object({ name: text, twitter: text }).nullish(),
  })
  .nullish();
type Identity = z.infer<typeof Identity>;

// Curated tags only; `potential_bot` is the API's own heuristic and is left out.
const BOT_TAGS = new Set(["bot", "arbitrage"]);

/** The API sends handles like `@@Cupseyy`. */
const handle = (v: string | null | undefined) => {
  const h = v?.trim().replace(/^@+/, "") ?? "";
  return h === "" ? null : h;
};
const label = (v: string | null | undefined) => {
  const t = v?.trim() ?? "";
  return t === "" ? null : t;
};

export function toIdentity(raw: Identity, forceKol = false): TraderIdentity {
  const tags = raw?.tags ?? [];
  const isKol = forceKol || raw?.kol != null || tags.includes("kol");
  const twitter = handle(raw?.kol?.twitter ?? raw?.twitter);
  const name = label(raw?.kol?.name) ?? label(raw?.name) ?? twitter ?? "KOL";
  return { kol: isKol ? { name, twitter } : null, bot: tags.some((t) => BOT_TAGS.has(t)) };
}

// Tracker timestamps are ms; seconds are normalised in case a route sends them.
const ms = (t: number | null | undefined) => (t == null ? null : t < 1e12 ? t * 1000 : t);

const TradeRowSchema = z.object({
  tx: z.string(),
  type: z.string(),
  wallet: z.string(),
  time: z.number(),
  amount: num,
  volume: num,
  volumeSol: num,
  identity: Identity,
});

const TradeList = z.union([
  z.object({ trades: z.array(z.unknown()) }).transform((r) => r.trades),
  z.array(z.unknown()),
]);

/**
 * Swaps, newest first. Liquidity events and rows that do not parse are dropped one by one, so one odd row cannot
 * blank the list; a response that is not a trade list at all throws.
 */
export function parseTrades(json: unknown, kols = false): PoolTrade[] {
  return TradeList.parse(json)
    .flatMap((raw): PoolTrade[] => {
      const r = TradeRowSchema.safeParse(raw);
      if (!r.success) return [];
      const t = r.data;
      const side = t.type;
      if (side !== "buy" && side !== "sell") return [];
      return [
        {
          tx: t.tx,
          side,
          wallet: t.wallet,
          time: ms(t.time) ?? 0,
          amount: t.amount ?? null,
          usd: t.volume ?? null,
          sol: t.volumeSol ?? null,
          identity: toIdentity(t.identity, kols),
        },
      ];
    })
    .sort((a, b) => b.time - a.time);
}

const TraderRowSchema = z.object({
  wallet: z.string(),
  pnl: z
    .object({
      token: z.object({ total: num }).nullish(),
      wallet: z.object({ total: num }).nullish(),
    })
    .nullish(),
  position: z.object({ balance: num, value: num }).nullish(),
  current: z.object({ balance: num, value: num }).nullish(),
  buyUsd: num,
  sellUsd: num,
  volume: z.object({ tokensBought: num, buyUsd: num, sellUsd: num }).nullish(),
  counts: z.object({ buys: num, sells: num, total: num }).nullish(),
  timing: z.object({ lastTrade: num, lastBuy: num, lastSell: num }).nullish(),
  identity: Identity,
});

/** One trader as the API values it: USD only. SOL is added at the current price by `toTopTraders`. */
export interface TraderStats {
  wallet: string;
  pnlUsd: number | null;
  holdingUsd: number | null;
  buyUsd: number | null;
  sellUsd: number | null;
  lifetimePnlUsd: number | null;
  trades: number | null;
  buys: number | null;
  sells: number | null;
  balance: number | null;
  tokensBought: number | null;
  lastTrade: number | null;
  lastBuy: number | null;
  lastSell: number | null;
  identity: TraderIdentity;
}

/** Trader rows, malformed ones dropped one by one like `parseTrades`. */
export function parseTraders(json: unknown): TraderStats[] {
  return z
    .object({ traders: z.array(z.unknown()) })
    .parse(json)
    .traders.flatMap((raw) => {
      const r = TraderRowSchema.safeParse(raw);
      if (!r.success) return [];
      const t = r.data;
      const counts = t.counts;
      return [
        {
          wallet: t.wallet,
          pnlUsd: t.pnl?.token?.total ?? null,
          holdingUsd: t.position?.value ?? t.current?.value ?? null,
          buyUsd: t.buyUsd ?? t.volume?.buyUsd ?? null,
          sellUsd: t.sellUsd ?? t.volume?.sellUsd ?? null,
          lifetimePnlUsd: t.pnl?.wallet?.total ?? null,
          trades: counts?.total ?? (counts?.buys != null && counts.sells != null ? counts.buys + counts.sells : null),
          buys: counts?.buys ?? null,
          sells: counts?.sells ?? null,
          balance: t.position?.balance ?? t.current?.balance ?? null,
          tokensBought: t.volume?.tokensBought ?? null,
          lastTrade: ms(t.timing?.lastTrade),
          lastBuy: ms(t.timing?.lastBuy),
          lastSell: ms(t.timing?.lastSell),
          identity: toIdentity(t.identity),
        },
      ];
    });
}

/** Union of several trader lists by wallet; the first list a wallet appears in wins. */
export function unionTraders(...lists: TraderStats[][]): TraderStats[] {
  const byWallet = new Map<string, TraderStats>();
  for (const list of lists) for (const t of list) if (!byWallet.has(t.wallet)) byWallet.set(t.wallet, t);
  return [...byWallet.values()];
}

const latest = (values: number[]) => (values.length === 0 ? null : Math.max(...values));

/** A KOL seen only in KOL trades, summed from those trades. Its balance is unknown, so its status is too. */
function kolOnlyStats(wallet: string, trades: PoolTrade[]): TraderStats {
  const buys = trades.filter((t) => t.side === "buy");
  const sells = trades.filter((t) => t.side === "sell");
  return {
    wallet,
    pnlUsd: null,
    holdingUsd: null,
    buyUsd: buys.length === 0 ? 0 : sumKnown(buys.map((t) => t.usd)),
    sellUsd: sells.length === 0 ? 0 : sumKnown(sells.map((t) => t.usd)),
    lifetimePnlUsd: null,
    trades: trades.length,
    buys: buys.length,
    sells: sells.length,
    balance: null,
    tokensBought: null,
    lastTrade: latest(trades.map((t) => t.time)),
    lastBuy: latest(buys.map((t) => t.time)),
    lastSell: latest(sells.map((t) => t.time)),
    identity: trades[0]?.identity ?? { kol: null, bot: false },
  };
}

/**
 * The trader table: listed traders (marked KOL where KOL trades name them) plus KOLs only KOL trades know about,
 * valued in SOL at `solUsd`, biggest buyers first.
 */
export function toTopTraders(listed: TraderStats[], kolTrades: PoolTrade[], solUsd: number | null): TopTrader[] {
  const kolTradesByWallet = new Map<string, PoolTrade[]>();
  for (const t of kolTrades) kolTradesByWallet.set(t.wallet, [...(kolTradesByWallet.get(t.wallet) ?? []), t]);
  const seen = new Set(listed.map((t) => t.wallet));
  const all = [
    ...listed.map((t) => {
      const kol = t.identity.kol ?? kolTradesByWallet.get(t.wallet)?.[0]?.identity.kol ?? null;
      return { ...t, identity: { ...t.identity, kol } };
    }),
    ...[...kolTradesByWallet].filter(([w]) => !seen.has(w)).map(([w, trades]) => kolOnlyStats(w, trades)),
  ];
  const toSol = (usd: number | null) => (usd == null || solUsd == null || solUsd <= 0 ? null : usd / solUsd);
  const amount = (usd: number | null): Amount => ({ usd, sol: toSol(usd) });
  return all
    .map((t) => ({
      wallet: t.wallet,
      tokenPnl: amount(t.pnlUsd),
      holding: amount(t.holdingUsd),
      bought: amount(t.buyUsd),
      sold: amount(t.sellUsd),
      lifetimePnlUsd: t.lifetimePnlUsd,
      trades: t.trades,
      buys: t.buys,
      sells: t.sells,
      balance: t.balance,
      lastTrade: t.lastTrade,
      lastBuy: t.lastBuy,
      lastSell: t.lastSell,
      status: holdStatus(t),
      identity: t.identity,
      tags: traderTags({
        identity: t.identity,
        tradeUsd: t.buyUsd,
        holdingUsd: t.holdingUsd,
        lifetimePnlUsd: t.lifetimePnlUsd,
      }),
    }))
    .sort((a, b) => (b.bought.usd ?? -Infinity) - (a.bought.usd ?? -Infinity));
}

/** Recent trades tagged; holding and lifetime PnL come from the trader table, joined by wallet. */
export function tagTrades(trades: PoolTrade[], top: readonly TopTrader[] | null): TradeRow[] {
  const byWallet = new Map((top ?? []).map((t) => [t.wallet, t]));
  return trades.map((t) => {
    const trader = byWallet.get(t.wallet);
    return {
      ...t,
      tags: traderTags({
        identity: {
          kol: t.identity.kol ?? trader?.identity.kol ?? null,
          bot: t.identity.bot || !!trader?.identity.bot,
        },
        tradeUsd: t.usd,
        holdingUsd: trader?.holding.usd ?? null,
        lifetimePnlUsd: trader?.lifetimePnlUsd ?? null,
      }),
    };
  });
}
