import { describe, expect, test } from "bun:test";
import {
  groupFlows,
  holdStatus,
  parseTraders,
  parseTrades,
  pickTraderMint,
  type TopTrader,
  type TraderIdentity,
  type TraderTag,
  tagTrades,
  toTopTraders,
  tradeFilter,
  traderTags,
} from "./traders";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const MEME = "MemeMint1111111111111111111111111111111111";
const T = 1_700_000_000_000;

const plain: TraderIdentity = { kol: null, bot: false };
const kinds = (tags: TraderTag[]) => tags.map((t) => t.kind);

describe("traderTags", () => {
  const tags = (over: Partial<Parameters<typeof traderTags>[0]>) =>
    kinds(traderTags({ identity: plain, tradeUsd: null, holdingUsd: null, lifetimePnlUsd: null, ...over }));

  test("whale and smart start exactly at their thresholds", () => {
    expect(tags({ tradeUsd: 9_999.99 })).toEqual([]);
    expect(tags({ tradeUsd: 10_000 })).toEqual(["whale"]);
    expect(tags({ holdingUsd: 49_999 })).toEqual([]);
    expect(tags({ holdingUsd: 50_000 })).toEqual(["whale"]);
    expect(tags({ lifetimePnlUsd: 99_999 })).toEqual([]);
    expect(tags({ lifetimePnlUsd: 100_000 })).toEqual(["smart"]);
  });

  test("unknown inputs never tag", () => {
    expect(tags({})).toEqual([]);
  });

  test("tags come in kol, whale, smart, bot order", () => {
    const all = traderTags({
      identity: { kol: { name: "Cupsey", twitter: "Cupseyy" }, bot: true },
      tradeUsd: 20_000,
      holdingUsd: null,
      lifetimePnlUsd: 250_000,
    });
    expect(all).toEqual([
      { kind: "kol", name: "Cupsey", twitter: "Cupseyy" },
      { kind: "whale" },
      { kind: "smart", lifetimePnlUsd: 250_000 },
      { kind: "bot" },
    ]);
  });
});

test("tradeFilter picks a group and hides bots", () => {
  const whaleBot: TraderTag[] = [{ kind: "whale" }, { kind: "bot" }];
  expect(tradeFilter(whaleBot, { kind: "whale", hideBots: false })).toBe(true);
  expect(tradeFilter(whaleBot, { kind: "whale", hideBots: true })).toBe(false);
  expect(tradeFilter(whaleBot, { kind: "kol", hideBots: false })).toBe(false);
  expect(tradeFilter([], { kind: "all", hideBots: true })).toBe(true);
});

test("pickTraderMint takes the non-quote side and offers top traders only for it", () => {
  expect(pickTraderMint(MEME, SOL)).toEqual({ mint: MEME, topOffered: true });
  expect(pickTraderMint(SOL, MEME)).toEqual({ mint: MEME, topOffered: true });
  expect(pickTraderMint(USDC, SOL)).toEqual({ mint: SOL, topOffered: false });
  expect(pickTraderMint(SOL, USDT)).toEqual({ mint: USDT, topOffered: false });
});

describe("holdStatus", () => {
  const status = (over: Partial<Parameters<typeof holdStatus>[0]>) =>
    holdStatus({ balance: 10, tokensBought: 100, sells: 1, lastBuy: 1, lastSell: 2, ...over });

  test("unknown balance or sells is unknown", () => {
    expect(status({ balance: null })).toBeNull();
    expect(status({ sells: null })).toBeNull();
  });

  test("an empty or dust balance after selling is sold out", () => {
    expect(status({ balance: 0 })).toBe("sold");
    expect(status({ balance: 99e-9 })).toBe("sold");
    expect(status({ balance: 101e-9 })).toBe("partial");
    // No sells but nothing left: transferred away, not a trade we can name.
    expect(status({ balance: 0, sells: 0 })).toBeNull();
  });

  test("holding, partial and bought back", () => {
    expect(status({ sells: 0 })).toBe("holding");
    expect(status({})).toBe("partial");
    expect(status({ lastBuy: 3, lastSell: 2 })).toBe("rebought");
    expect(status({ lastBuy: null })).toBe("partial");
  });
});

describe("parseTrades", () => {
  const swap = (over: Record<string, unknown>) => ({
    tx: "sig",
    type: "buy",
    wallet: "W1",
    time: 1_700_000_000_000,
    amount: 5,
    priceUsd: 1,
    volume: 100,
    volumeSol: 0.5,
    ...over,
  });

  test("keeps swaps newest first and drops liquidity events and malformed rows", () => {
    const trades = parseTrades({
      trades: [
        swap({ tx: "old", time: 1_000_000_000_000 }),
        swap({ tx: "lp", type: "add_liquidity" }),
        swap({ tx: "rm", type: "remove_liquidity" }),
        { tx: "broken", type: "sell" },
        swap({ tx: "new", type: "sell", time: 2_000_000_000_000 }),
      ],
      nextCursor: null,
      hasNextPage: false,
    });
    expect(trades.map((t) => [t.tx, t.side])).toEqual([
      ["new", "sell"],
      ["old", "buy"],
    ]);
  });

  test("a response that is not a trade list throws", () => {
    expect(() => parseTrades({ error: "nope" })).toThrow();
  });

  test("identity: KOL name and twitter, all leading @ stripped, empty handle null, bots by curated tag", () => {
    const [kol, empty, none, bot, heuristic] = parseTrades({
      trades: [
        swap({ tx: "a", time: 5, identity: { name: "Fallback", kol: { name: "Cupsey", twitter: "@@Cupseyy" } } }),
        swap({ tx: "b", time: 4, identity: { name: "Ansem", twitter: "@", tags: ["kol"] } }),
        swap({ tx: "c", time: 3, identity: null }),
        swap({ tx: "d", time: 2, identity: { tags: ["arbitrage"] } }),
        swap({ tx: "e", time: 1, identity: { tags: ["potential_bot"] } }),
      ],
    });
    expect(kol?.identity).toEqual({ kol: { name: "Cupsey", twitter: "Cupseyy" }, bot: false });
    expect(empty?.identity).toEqual({ kol: { name: "Ansem", twitter: null }, bot: false });
    expect(none?.identity).toEqual(plain);
    expect(bot?.identity.bot).toBe(true);
    expect(heuristic?.identity.bot).toBe(false);
  });

  test("KOL trades mark every row a KOL, from a bare array too", () => {
    const [row] = parseTrades([swap({ identity: { name: "Gake", twitter: "@Gake" } })], true);
    expect(row?.identity.kol).toEqual({ name: "Gake", twitter: "Gake" });
  });
});

const traderRow = (over: Record<string, unknown>) => ({
  wallet: "W1",
  pnl: { token: { realized: 0, unrealized: 10, total: 10 }, wallet: { total: 1_000 } },
  position: { balance: 50, value: 500 },
  buyUsd: 2_000,
  sellUsd: 0,
  counts: { buys: 1, sells: 0, total: 1 },
  timing: { lastTrade: 1_000, lastBuy: 1_000, lastSell: null },
  identity: null,
  ...over,
});

describe("toTopTraders", () => {
  test("reads fallbacks, drops malformed rows, converts SOL at the given price and sorts by bought", () => {
    const listed = parseTraders({
      traders: [
        traderRow({ wallet: "Small" }),
        { pnl: {} },
        traderRow({
          wallet: "Big",
          buyUsd: null,
          sellUsd: null,
          volume: { tokensBought: 100, buyUsd: 30_000, sellUsd: 5_000 },
          position: null,
          current: { balance: 0, value: 0 },
          counts: { buys: 2, sells: 1, total: 3 },
        }),
      ],
    });
    const [big, small] = toTopTraders(listed, [], 200);
    expect(big).toMatchObject({
      wallet: "Big",
      bought: { usd: 30_000, sol: 150 },
      sold: { usd: 5_000, sol: 25 },
      balance: 0,
      status: "sold",
    });
    expect(kinds(big?.tags ?? [])).toEqual(["whale"]);
    expect(small).toMatchObject({ wallet: "Small", holding: { usd: 500, sol: 2.5 }, status: "holding" });
    expect(toTopTraders(listed, [], null)[0]?.bought.sol).toBeNull();
  });

  test("KOL trades name listed wallets and add KOL-only wallets with unknown status", () => {
    const listed = parseTraders({ traders: [traderRow({ wallet: "Listed" })] });
    const kolTrades = parseTrades(
      [
        { tx: "1", type: "buy", wallet: "Listed", time: T + 10, volume: 1, identity: { name: "A" } },
        { tx: "2", type: "buy", wallet: "Only", time: T + 20, volume: 8_000, identity: { name: "B" } },
        { tx: "3", type: "buy", wallet: "Only", time: T + 30, volume: 4_000, identity: { name: "B" } },
        { tx: "4", type: "sell", wallet: "Only", time: T + 40, volume: 1_000, identity: { name: "B" } },
      ],
      true,
    );
    const rows = toTopTraders(listed, kolTrades, 100);
    const only = rows.find((r) => r.wallet === "Only");
    expect(only).toMatchObject({
      bought: { usd: 12_000 },
      sold: { usd: 1_000 },
      buys: 2,
      sells: 1,
      lastBuy: T + 30,
      lastSell: T + 40,
      balance: null,
      status: null,
    });
    expect(kinds(only?.tags ?? [])).toEqual(["kol", "whale"]);
    expect(rows.find((r) => r.wallet === "Listed")?.identity.kol?.name).toBe("A");
  });
});

test("tagTrades joins holding and lifetime PnL from the trader table by wallet", () => {
  const top = toTopTraders(
    parseTraders({ traders: [traderRow({ wallet: "Rich", position: { balance: 1, value: 60_000 } })] }),
    [],
    100,
  ).map((t) => ({ ...t, lifetimePnlUsd: 200_000 }));
  const trades = parseTrades([
    { tx: "a", type: "buy", wallet: "Rich", time: 2, volume: 10 },
    { tx: "b", type: "buy", wallet: "Nobody", time: 1, volume: 10 },
  ]);
  const [rich, nobody] = tagTrades(trades, top);
  expect(kinds(rich?.tags ?? [])).toEqual(["whale", "smart"]);
  expect(nobody?.tags).toEqual([]);
});

describe("groupFlows", () => {
  const trader = (over: Partial<TopTrader>): TopTrader => ({
    wallet: "W",
    tokenPnl: { usd: null, sol: null },
    holding: { usd: null, sol: null },
    bought: { usd: 0, sol: 0 },
    sold: { usd: 0, sol: 0 },
    lifetimePnlUsd: null,
    trades: null,
    buys: 0,
    sells: 0,
    balance: null,
    lastTrade: null,
    lastBuy: null,
    lastSell: null,
    status: null,
    identity: plain,
    tags: [],
    ...over,
  });

  test("a wallet counts in every group it is tagged with, bots in none", () => {
    const groups = groupFlows(
      [
        trader({
          wallet: "KolWhale",
          tags: [{ kind: "kol", name: "K", twitter: null }, { kind: "whale" }],
          bought: { usd: 20_000, sol: null },
          sold: { usd: 5_000, sol: null },
          buys: 2,
          sells: 1,
          status: "partial",
        }),
        trader({
          wallet: "Whale",
          tags: [{ kind: "whale" }],
          bought: { usd: 10_000, sol: null },
          buys: 1,
          status: "holding",
        }),
        trader({
          wallet: "WhaleBot",
          tags: [{ kind: "whale" }, { kind: "bot" }],
          bought: { usd: 1_000_000, sol: null },
          buys: 9,
        }),
      ],
      100,
    );
    const [kol, whale, smart] = groups;
    expect(kol).toMatchObject({ kind: "kol", wallets: 1, buyers: 1, sellers: 1, netUsd: 15_000, partial: 1 });
    expect(whale).toMatchObject({
      kind: "whale",
      wallets: 2,
      buyers: 2,
      sellers: 1,
      buyUsd: 30_000,
      sellUsd: 5_000,
      netUsd: 25_000,
      buySol: 300,
      netSol: 250,
      holding: 1,
      partial: 1,
      unknown: 0,
    });
    expect(smart).toMatchObject({ kind: "smart", wallets: 0, buyUsd: null, netUsd: null, netSol: null });
  });

  test("unknown status counts as unknown and SOL is null without a price", () => {
    const [kol] = groupFlows([trader({ tags: [{ kind: "kol", name: "K", twitter: null }] })], null);
    expect(kol).toMatchObject({ unknown: 1, buySol: null });
  });
});
