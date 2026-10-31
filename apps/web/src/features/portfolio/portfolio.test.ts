import { describe, expect, test } from "bun:test";
import { compactUsd, duration, formatPrice, fullDuration, timeAgo, utcStamp } from "./money";
import {
  type ActivePool,
  type ActivePosition,
  activityRows,
  binLadder,
  binSpan,
  type ClosedPosition,
  closedPoolRows,
  cumulative,
  dailyBuckets,
  fdvAt,
  inRange,
  monthCalendar,
  openedAt,
  type PoolMeta,
  type PositionEvent,
  poolTotals,
  rangeOffsets,
  resolveRange,
  SOL_MINT,
  series,
  summarize,
  tokenRisks,
  transactionPools,
  transactionRows,
} from "./portfolio";

const at = (iso: string) => Date.parse(iso);

const pos = (closedAt: string, pnl: number, fees = 0): ClosedPosition => {
  const amounts = { deposit: 10, withdraw: 10 + pnl, fees, pnl };
  return {
    address: `p${closedAt}${pnl}`,
    pool: "pool",
    pair: "SOL-USDC",
    openedAt: at(closedAt) - 3_600_000,
    closedAt: at(closedAt),
    sol: amounts,
    usd: { ...amounts, pnl: pnl * 100 },
  };
};

describe("resolveRange", () => {
  // Saturday 2026-10-31 15:00 UTC
  const now = at("2026-10-31T15:00:00Z");

  test("week presets start on Sunday and end at tomorrow's midnight", () => {
    expect(resolveRange("this-week", now)).toEqual({ from: at("2026-10-25"), to: at("2026-11-01") });
    expect(resolveRange("last-week", now)).toEqual({ from: at("2026-10-18"), to: at("2026-10-25") });
  });

  test("month, quarter, and year presets cross boundaries correctly", () => {
    expect(resolveRange("last-month", now)).toEqual({ from: at("2026-09-01"), to: at("2026-10-01") });
    expect(resolveRange("qtd", now)).toEqual({ from: at("2026-10-01"), to: at("2026-11-01") });
    expect(resolveRange("last-year", now)).toEqual({ from: at("2025-01-01"), to: at("2026-01-01") });
    expect(resolveRange("last-7", now)).toEqual({ from: at("2026-10-25"), to: at("2026-11-01") });
  });

  test("custom passes through and inRange treats `to` as exclusive", () => {
    const range = resolveRange("custom", now, { from: at("2026-10-02"), to: at("2026-10-03") });
    const kept = inRange(
      [pos("2026-10-01T23:59:59Z", 1), pos("2026-10-02T12:00:00Z", 2), pos("2026-10-03T00:00:00Z", 3)],
      range,
    );
    expect(kept.map((p) => p.sol.pnl)).toEqual([2]);
  });
});

test("summarize counts break-even as a loss and derives ratios from gross sums", () => {
  const stats = summarize(
    [
      pos("2026-10-01T01:00:00Z", 3),
      pos("2026-10-01T02:00:00Z", -1),
      pos("2026-10-02T01:00:00Z", 0),
      pos("2026-10-03T01:00:00Z", 1),
    ],
    "sol",
  );
  expect(stats).toMatchObject({
    count: 4,
    net: 3,
    wins: 2,
    losses: 2,
    grossProfit: 4,
    grossLoss: 1,
    profitFactor: 4,
    avgWin: 2,
    avgLoss: 0.5,
    winLossRatio: 4,
    dayWins: 2,
    dayLosses: 1,
    avgInvested: 10,
  });
  expect(summarize([pos("2026-10-01T01:00:00Z", 2)], "sol").profitFactor).toBeNull();
  expect(summarize([pos("2026-10-01T01:00:00Z", 2)], "usd").net).toBe(200);
});

test("daily buckets split on UTC midnight and series fills gaps", () => {
  const days = dailyBuckets(
    [pos("2026-10-01T23:59:00Z", 1), pos("2026-10-02T00:01:00Z", 2), pos("2026-10-04T10:00:00Z", -1)],
    "sol",
    "pnl",
  );
  expect(days.map((b) => [b.start, b.value])).toEqual([
    [at("2026-10-01"), 1],
    [at("2026-10-02"), 2],
    [at("2026-10-04"), -1],
  ]);
  expect(series(days, "daily").map((b) => b.value)).toEqual([1, 2, 0, -1]);
  expect(cumulative(days).map((b) => b.value)).toEqual([1, 3, 3, 2]);
  expect(series(days, "monthly")).toEqual([{ start: at("2026-10-01"), value: 2, positions: 3, wins: 2 }]);
  expect(dailyBuckets([pos("2026-10-01T01:00:00Z", -1, 0.25)], "sol", "fees")[0]?.value).toBe(0.25);
});

test("month calendar counts spill-over days in week totals but not in the month", () => {
  const days = dailyBuckets(
    [pos("2026-09-27T12:00:00Z", 0.12), pos("2026-10-01T12:00:00Z", 0.5), pos("2026-10-31T12:00:00Z", 1)],
    "sol",
    "pnl",
  );
  const cal = monthCalendar(days, 2026, 9);
  expect(cal.weeks).toHaveLength(5);
  expect(cal.weeks[0]?.cells[0]).toMatchObject({ day: 27, inMonth: false });
  expect(cal.weeks[0]?.total).toBeCloseTo(0.62);
  expect(cal.weeks[0]?.activeDays).toBe(2);
  expect(cal.total).toBeCloseTo(1.5);
  expect(cal.activeDays).toBe(2);
  expect(cal.weeks[4]?.cells[6]?.date).toBe(at("2026-10-31"));
});

const active = (lowerBin: number, upperBin: number, minPrice: number, opened: string | null): ActivePosition => {
  const amounts = { deposit: 10, withdraw: 4, fees: 0.5, pnl: 1, balance: 7, unclaimed: 0.25 };
  return {
    address: `a${lowerBin}`,
    pool: "pool",
    pair: "DOGE-SOL",
    openedAt: opened === null ? null : at(opened),
    lowerBin,
    upperBin,
    minPrice,
    maxPrice: minPrice * 1.0025 ** (upperBin - lowerBin),
    inRange: true,
    sol: amounts,
    usd: { ...amounts, pnl: 100 },
  };
};

const token = (symbol: string, mint: string, priceUsd: number | null) => ({
  symbol,
  mint,
  icon: null,
  verified: true,
  priceUsd,
  organicScore: null,
  risks: null,
});

test("token risks read Jupiter's audit, falling back to the mint authority when the flag is missing", () => {
  // DOGE's audit on 2026-10-31: Jupiter omits mintAuthorityDisabled but the token still has a mint authority.
  expect(
    tokenRisks({
      mintAuthority: "FCBW5Xs4grHRpDPtfEgtYrBc97QSwBvKUxwJkbt3ZdJZ",
      freezeAuthorityDisabled: true,
      topHoldersPercentage: 23.2,
      devMints: 29,
    }),
  ).toEqual(["Mint authority enabled", "Top holders own 23%", "Developer has launched 29 tokens"]);
  expect(tokenRisks({ mintAuthorityDisabled: true, mintAuthority: "x", topHoldersPercentage: 20 })).toEqual([]);
  expect(tokenRisks({ isSus: true, freezeAuthorityDisabled: false })).toEqual([
    "Flagged as suspicious",
    "Freeze authority enabled",
  ]);
});

const pool: ActivePool = {
  address: "pool",
  pair: "DOGE-SOL",
  tokenX: token("DOGE", "DoGE", 0.075),
  tokenY: token("SOL", SOL_MINT, 95),
  binStep: 25,
  baseFee: 0.25,
  dynamicFee: null,
  price: 0.000787,
  activeBin: -1940,
  fdv: 1_265_000,
  tvl: 114_200,
  positions: [],
};

describe("active positions", () => {
  const a = active(-1942, -1938, 0.0007836, "2026-10-30T20:30:10Z");
  const b = active(-1950, -1945, 0.000768, null);

  test("poolTotals sums every amount in the chosen currency", () => {
    expect(poolTotals([a, b], "sol")).toEqual({
      deposit: 20,
      withdraw: 8,
      fees: 1,
      pnl: 2,
      balance: 14,
      unclaimed: 0.5,
    });
    expect(poolTotals([a, b], "usd").pnl).toBe(200);
    expect(poolTotals([], "sol").deposit).toBe(0);
  });

  test("binSpan covers every position and openedAt skips unknown times", () => {
    expect(binSpan([a, b])).toEqual({ lowerBin: -1950, upperBin: -1938, minPrice: b.minPrice, maxPrice: a.maxPrice });
    expect(binSpan([])).toBeNull();
    expect(openedAt([b, a])).toBe(at("2026-10-30T20:30:10Z"));
    expect(openedAt([b])).toBeNull();
  });

  test("rangeOffsets are ratios from the current price", () => {
    const o = rangeOffsets({ minPrice: 0.99, maxPrice: 1.01 }, 1);
    expect(o.lower).toBeCloseTo(-0.01);
    expect(o.upper).toBeCloseTo(0.01);
  });

  test("binLadder prices each bin by bin step and splits sides at the active bin", () => {
    const ladder = binLadder(a, pool);
    expect(ladder.map((x) => x.side)).toEqual(["y", "y", "active", "x", "x"]);
    expect(ladder[0]?.price).toBe(a.minPrice);
    expect(ladder[4]?.price).toBeCloseTo(a.maxPrice, 12);
    expect(binLadder(a, { ...pool, activeBin: null, price: a.minPrice * 1.0025 ** 3 })[3]?.side).toBe("active");
    expect(binLadder(a, { ...pool, activeBin: -1900 }).every((x) => x.side === "y")).toBe(true);
  });

  test("fdvAt scales FDV with price", () => {
    expect(fdvAt(pool, pool.price * 2)).toBeCloseTo(2_530_000);
    expect(fdvAt({ ...pool, fdv: null }, 1)).toBeNull();
  });

  test("activityRows prices SOL and FDV from the events and carries them forward", () => {
    const event = (amountX: number, amountXUsd: number, amountY: number, amountYUsd: number): PositionEvent => ({
      id: `s${amountX}${amountY}`,
      signature: `s${amountX}${amountY}`,
      type: "add",
      at: at("2026-10-30T20:30:10Z"),
      amountX,
      amountY,
      amountXUsd,
      amountYUsd,
      totalUsd: amountXUsd + amountYUsd,
    });
    const rows = activityRows([event(1000, 80, 0, 0), event(1000, 70, 1, 100), event(0, 0, 0.5, 60)], pool, 95);
    // No SOL side yet: the current price stands in; supply is fdv / price.
    expect(rows[0]?.total.sol).toBeCloseTo(80 / 95);
    expect(rows[0]?.fdv).toBeCloseTo(0.08 * (1_265_000 / 0.075));
    expect(rows[1]?.y.sol).toBeCloseTo(1);
    expect(rows[1]?.x.sol).toBeCloseTo(0.7);
    expect(rows[1]?.fdv).toBeCloseTo(0.07 * (1_265_000 / 0.075));
    expect(rows[2]?.total.sol).toBeCloseTo(0.5);
    expect(rows[2]?.fdv).toBe(rows[1]?.fdv ?? Number.NaN);
    expect(activityRows([event(1, 1, 0, 0)], { ...pool, fdv: null }, null)[0]).toMatchObject({
      fdv: null,
      total: { usd: 1, sol: null },
    });
  });
});

test("active formatters", () => {
  expect(duration((21 * 3600 + 7 * 60 + 57) * 1000)).toBe("21h 07m 57s");
  expect(duration((2 * 86_400 + 3 * 3600 + 4 * 60 + 5) * 1000)).toBe("2d 03h 04m");
  expect(compactUsd(1_268_000)).toBe("$1.27M");
  expect(compactUsd(114_200)).toBe("$114.20K");
  expect(compactUsd(950.123)).toBe("$950.12");
  expect(formatPrice(0.00078366)).toBe("0.000784");
  expect(formatPrice(152.123456)).toBe("152.1235");
  expect(utcStamp(at("2026-10-30T20:30:10Z"), " at ")).toBe("Oct 30, 2026 at 20:30:10");
  expect(utcStamp(at("2026-10-30T00:00:01Z"))).toBe("Oct 30, 2026 00:00:01");
});

describe("closed pools", () => {
  const meta = (address: string, pair: string): PoolMeta => {
    const [x = "", y = ""] = pair.split("-");
    const token = (symbol: string) => ({
      symbol,
      mint: symbol,
      icon: null,
      verified: false,
      priceUsd: null,
      organicScore: null,
      risks: null,
    });
    return { address, pair, tokenX: token(x), tokenY: token(y), binStep: 10, baseFee: 0.1, dynamicFee: null };
  };
  const closedIn = (pool: string, opened: string, closed: string, pnl: number): ClosedPosition => {
    const amounts = { deposit: 10, withdraw: 10 + pnl, fees: 1, pnl };
    return {
      address: `${pool}${opened}`,
      pool,
      pair: pool === "a" ? "DOGE-SOL" : "PEPE-SOL",
      openedAt: at(opened),
      closedAt: at(closed),
      sol: amounts,
      usd: { ...amounts, pnl: pnl * 100 },
    };
  };

  test("groups by pool, sums amounts and time held, and numbers positions by open time", () => {
    const rows = closedPoolRows(
      [
        closedIn("a", "2026-10-01T00:00:00Z", "2026-10-01T01:00:00Z", 1),
        closedIn("b", "2026-10-02T00:00:00Z", "2026-10-02T00:30:00Z", -2),
        closedIn("a", "2026-10-03T00:00:00Z", "2026-10-03T02:00:00Z", 3),
      ],
      [meta("a", "DOGE-SOL"), meta("b", "PEPE-SOL")],
    );
    expect(rows.map((r) => r.pool.address)).toEqual(["a", "b"]);
    const [a] = rows;
    expect(a?.positions.map((p) => p.n)).toEqual([2, 1]);
    expect(a?.lastClosedAt).toBe(at("2026-10-03T02:00:00Z"));
    expect(a?.heldMs).toBe(3 * 3_600_000);
    expect(a?.sol).toEqual({ deposit: 20, withdraw: 24, fees: 2, pnl: 4 });
    expect(a?.usd.pnl).toBe(400);
  });

  test("a position whose pool has no metadata still gets a row named from its pair", () => {
    const [row] = closedPoolRows([closedIn("b", "2026-10-02T00:00:00Z", "2026-10-02T00:30:00Z", -2)], []);
    expect(row?.pool.pair).toBe("PEPE-SOL");
    expect(row?.pool.tokenX.symbol).toBe("PEPE");
  });
});

describe("transactions", () => {
  const token = (symbol: string, mint = symbol) => ({
    symbol,
    mint,
    icon: null,
    verified: false,
    priceUsd: 2,
    organicScore: null,
    risks: null,
  });
  const meta = (address: string): PoolMeta => ({
    address,
    pair: "DOGE-SOL",
    tokenX: token("DOGE"),
    tokenY: token("SOL", SOL_MINT),
    binStep: 10,
    baseFee: 0.1,
    dynamicFee: null,
  });
  const event = (signature: string, iso: string, amountY = 1, amountYUsd = 100): PositionEvent => ({
    id: `${signature}:0:add`,
    signature,
    type: "add",
    at: at(iso),
    amountX: 10,
    amountY,
    amountXUsd: 20,
    amountYUsd,
    totalUsd: 20 + amountYUsd,
  });
  const pools = transactionPools({ closedPools: [meta("a"), meta("b")], active: [] });

  test("merges every position newest first, each priced from its own history", () => {
    const rows = transactionRows(
      [
        {
          position: "p1",
          pool: "a",
          openedAt: null,
          closedAt: null,
          events: [event("s1", "2026-10-01T00:00:00Z", 1, 100), event("s3", "2026-10-03T00:00:00Z", 0, 0)],
        },
        {
          position: "p2",
          pool: "b",
          openedAt: null,
          closedAt: null,
          events: [event("s2", "2026-10-02T00:00:00Z", 1, 200)],
        },
      ],
      pools,
      150,
    );
    expect(rows.map((r) => [r.signature, r.pool.address])).toEqual([
      ["s3", "a"],
      ["s2", "b"],
      ["s1", "a"],
    ]);
    // s3 has no SOL side, so it carries p1's SOL price forward, not p2's later one.
    expect(rows[0]?.total.sol).toBeCloseTo(20 / 100);
  });

  test("one signature touching two positions yields two distinct ids", () => {
    const shared = event("s1", "2026-10-01T00:00:00Z");
    const rows = transactionRows(
      [
        { position: "p1", pool: "a", openedAt: null, closedAt: null, events: [shared] },
        { position: "p2", pool: "b", openedAt: null, closedAt: null, events: [shared] },
      ],
      pools,
      null,
    );
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  test("a history whose pool is unknown is skipped", () => {
    const rows = transactionRows(
      [
        { position: "p1", pool: "gone", openedAt: null, closedAt: null, events: [event("s1", "2026-10-01T00:00:00Z")] },
        { position: "p2", pool: "a", openedAt: null, closedAt: null, events: [event("s2", "2026-10-02T00:00:00Z")] },
      ],
      pools,
      null,
    );
    expect(rows.map((r) => r.signature)).toEqual(["s2"]);
  });

  test("opening and closing a position become rows around its events", () => {
    const rows = transactionRows(
      [
        {
          position: "p1",
          pool: "a",
          openedAt: at("2026-10-01T00:00:00Z"),
          closedAt: at("2026-10-02T00:00:00Z"),
          events: [event("s1", "2026-10-01T00:00:00Z"), event("s2", "2026-10-02T00:00:00Z")],
        },
        { position: "p2", pool: "b", openedAt: at("2026-10-03T00:00:00Z"), closedAt: null, events: [] },
      ],
      pools,
      null,
    );
    // Same-instant rows keep lifecycle order with the latest on top: close above the last event, add above open.
    expect(rows.map((r) => [r.position, r.type, r.signature])).toEqual([
      ["p2", "initialize", null],
      ["p1", "close", null],
      ["p1", "add", "s2"],
      ["p1", "add", "s1"],
      ["p1", "initialize", null],
    ]);
    expect(rows[1]?.total).toEqual({ usd: 0, sol: 0 });
  });

  test("an active pool's FDV wins over the same pool listed as closed", () => {
    const live = { ...meta("a"), price: 1, activeBin: null, fdv: 2_000, tvl: null, positions: [] };
    const merged = transactionPools({ closedPools: [meta("a")], active: [live] });
    expect(merged.get("a")?.fdv).toBe(2_000);
    expect(pools.get("a")?.fdv).toBeNull();
  });
});

test("closed-position time formatters", () => {
  expect(fullDuration(102_000)).toBe("1m 42s");
  expect(fullDuration(5_094_000)).toBe("1h 24m 54s");
  expect(fullDuration((8 * 86_400 + 9 * 3600 + 36 * 60 + 36) * 1000)).toBe("8d 09h 36m 36s");
  const now = at("2026-10-31T12:00:00Z");
  expect(timeAgo(now - 20_000, now)).toBe("a few seconds ago");
  expect(timeAgo(now - 5 * 60_000, now)).toBe("5 minutes ago");
  expect(timeAgo(now - 30 * 3_600_000, now)).toBe("a day ago");
  expect(timeAgo(now - 9 * 86_400_000, now)).toBe("9 days ago");
});
