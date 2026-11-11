import { describe, expect, test } from "bun:test";
import {
  type FeeWindows,
  feePace,
  momentum,
  type ScreenerFilters,
  type ScreenerPool,
  screen,
  stepBand,
  totals,
  turnover,
  warnings,
} from "./screener";

const SOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const flat = (perHour: number): FeeWindows => ({
  "30m": perHour * 0.5,
  "1h": perHour,
  "2h": perHour * 2,
  "4h": perHour * 4,
  "12h": perHour * 12,
  "24h": perHour * 24,
});

const pool = (over: Partial<ScreenerPool> & { name: string }): ScreenerPool => {
  const [x = "X", y = "Y"] = over.name.split("-");
  return {
    address: `pool-${over.name}`,
    binStep: 20,
    baseFeePct: 0.2,
    tvl: 100_000,
    volume24h: 50_000,
    fees24h: 100,
    feeTvl: flat(0.01),
    createdAt: 0,
    blacklisted: false,
    tags: [],
    launchpad: null,
    tokenX: { mint: `mint-${x}`, symbol: x, icon: null, verified: true, freezable: false },
    tokenY: { mint: y === "SOL" ? SOL : `mint-${y}`, symbol: y, icon: null, verified: true, freezable: false },
    ...over,
  };
};

const open: ScreenerFilters = { minTvl: 0, minVolume: 0, step: "all", query: "", blacklisted: false };
const names = (pools: ScreenerPool[]) => pools.map((p) => p.name);

describe("feePace", () => {
  test("a steady pool earns the same rate in every stretch", () => {
    for (const rate of feePace(flat(0.02))) expect(rate).toBeCloseTo(0.02);
  });
  test("stretches run oldest first and a burst lands in the stretch it happened in", () => {
    const f = { ...flat(0.01), "30m": 0.505, "1h": 0.51, "2h": 0.52, "4h": 0.54, "12h": 0.62, "24h": 0.74 };
    const pace = feePace(f);
    expect(pace).toHaveLength(6);
    expect(pace[5]).toBeCloseTo(1.01);
    expect(pace[0]).toBeCloseTo(0.01);
  });
  test("a window smaller than the one inside it never goes negative", () => {
    expect(feePace({ ...flat(0.01), "24h": 0.1 })[0]).toBe(0);
  });
});

describe("derived ratios", () => {
  test("momentum is the last hour against the day's hourly average", () => {
    expect(momentum(flat(0.01))).toBeCloseTo(1);
    expect(momentum({ ...flat(0.01), "1h": 0.03 })).toBeCloseTo(3);
  });
  test("no fees in 24h or no TVL is unknown, not zero", () => {
    expect(momentum(flat(0))).toBeNull();
    expect(turnover({ volume24h: 10, tvl: 0 })).toBeNull();
    expect(turnover({ volume24h: 50, tvl: 100 })).toBe(0.5);
  });
  test("bin step bands", () => {
    expect([1, 20, 25, 80, 100, 400].map(stepBand)).toEqual(["tight", "tight", "medium", "medium", "wide", "wide"]);
  });
});

describe("warnings", () => {
  test("a clean pool has none, and a quote token's freeze authority is not flagged", () => {
    const p = pool({ name: "SOL-USDC" });
    p.tokenY = { ...p.tokenY, mint: USDC, freezable: true };
    expect(warnings(p)).toEqual([]);
  });
  test("blacklist, unverified, freezable and tags each show up", () => {
    const p = pool({ name: "RUG-SOL", blacklisted: true, tags: ["honeypot"] });
    p.tokenX = { ...p.tokenX, verified: false, freezable: true };
    expect(warnings(p).map((w) => w.kind)).toEqual(["blacklisted", "unverified", "freezable", "tag"]);
  });
});

describe("screen", () => {
  const pools = [
    pool({ name: "A-SOL", feeTvl: flat(0.01), tvl: 5_000, volume24h: 9_000, binStep: 100 }),
    pool({ name: "B-SOL", feeTvl: flat(0.05), tvl: 50_000, volume24h: 2_000, binStep: 20 }),
    pool({ name: "C-USDC", feeTvl: flat(0.03), tvl: 80_000, volume24h: 90_000, binStep: 50, blacklisted: true }),
    pool({ name: "D-USDC", feeTvl: flat(0), tvl: 20_000, volume24h: 20_000, binStep: 80 }),
  ];
  test("default order is Fee/TVL 24h, highest first, with blacklisted pools hidden", () => {
    expect(names(screen(pools, open, "feeTvl24h", "desc"))).toEqual(["B-SOL", "A-SOL", "D-USDC"]);
    expect(names(screen(pools, { ...open, blacklisted: true }, "feeTvl24h", "desc"))[1]).toBe("C-USDC");
  });
  test("minimums and the bin step band narrow the list", () => {
    expect(names(screen(pools, { ...open, minTvl: 10_000 }, "tvl", "asc"))).toEqual(["D-USDC", "B-SOL"]);
    expect(names(screen(pools, { ...open, minVolume: 5_000 }, "tvl", "asc"))).toEqual(["A-SOL", "D-USDC"]);
    expect(names(screen(pools, { ...open, step: "medium" }, "tvl", "asc"))).toEqual(["D-USDC"]);
  });
  test("the query matches a token, a pair in either order, or an exact address", () => {
    expect(names(screen(pools, { ...open, query: "usdc" }, "name", "asc"))).toEqual(["D-USDC"]);
    expect(names(screen(pools, { ...open, query: "sol-b" }, "name", "asc"))).toEqual(["B-SOL"]);
    expect(names(screen(pools, { ...open, query: SOL }, "name", "asc"))).toEqual(["A-SOL", "B-SOL"]);
    expect(screen(pools, { ...open, query: "zzz" }, "name", "asc")).toEqual([]);
  });
  test("a pool with no value for the sort column is last in both directions", () => {
    expect(names(screen(pools, open, "momentum", "desc")).at(-1)).toBe("D-USDC");
    expect(names(screen(pools, open, "momentum", "asc")).at(-1)).toBe("D-USDC");
  });
});

test("totals add up the listed pools and weight Fee/TVL by TVL", () => {
  const t = totals([
    pool({ name: "A-SOL", tvl: 100, fees24h: 1, volume24h: 10 }),
    pool({ name: "B-SOL", tvl: 300, fees24h: 1, volume24h: 30 }),
  ]);
  expect(t).toEqual({ tvl: 400, volume24h: 40, fees24h: 2, feeTvl: 0.5 });
  expect(totals([]).feeTvl).toBeNull();
});
