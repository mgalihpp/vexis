import { describe, expect, test } from "bun:test";
import { alertable } from "@vexis/db/screen";
import {
  alertFilter,
  asFilterPool,
  baseToken,
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
  xShare,
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

const token = (mint: string, symbol: string) => ({
  mint,
  symbol,
  icon: null,
  verified: true,
  freezable: false,
  mintable: false,
  marketCap: null,
  holders: null,
  organic: null,
  topHolders: null,
});

const pool = (over: Partial<ScreenerPool> & { name: string }): ScreenerPool => {
  const [x = "X", y = "Y"] = over.name.split("-");
  return {
    address: `pool-${over.name}`,
    binStep: 20,
    baseFeePct: 0.2,
    tvl: 100_000,
    volume: flat(50_000 / 24),
    fees24h: 100,
    feeTvl: flat(0.01),
    createdAt: 0,
    blacklisted: false,
    tags: [],
    launchpad: null,
    tokenX: token(`mint-${x}`, x),
    tokenY: token(y === "SOL" ? SOL : `mint-${y}`, y),
    xShare: 0.5,
    stats: null,
    ...over,
  };
};

const STATS = {
  activeTvl: 0,
  feeActiveTvl: 0,
  swaps: 0,
  traders: 0,
  lps: 0,
  openPositions: 0,
  inRangePct: 0,
  deposits: 0,
  withdrawals: 0,
  netDeposits: 0,
  volatility: 0,
  priceChange: 0,
  volumeChange: 0,
  trend: [],
};

const open: ScreenerFilters = {
  minTvl: 0,
  minVolume: 0,
  minMcap: 0,
  maxMcap: 0,
  window: "24h",
  step: "all",
  query: "",
  blacklisted: false,
};
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
    expect(turnover({ volume: flat(10 / 24), tvl: 0 })).toBeNull();
    expect(turnover({ volume: flat(50 / 24), tvl: 100 })).toBe(0.5);
  });
  test("composition is token X's USD share, unknown when the pool holds nothing", () => {
    expect(xShare(30, 10)).toBe(0.75);
    expect(xShare(0, 0)).toBeNull();
    expect(xShare(Number.NaN, 5)).toBeNull();
  });
  test("the base token is the side that is not a quote", () => {
    const p = pool({ name: "SOL-BONK" });
    p.tokenX = { ...p.tokenX, mint: SOL };
    expect(baseToken(p).symbol).toBe("BONK");
    expect(baseToken(pool({ name: "BONK-SOL" })).symbol).toBe("BONK");
  });
  test("bin step bands", () => {
    expect([1, 20, 25, 80, 100, 400].map(stepBand)).toEqual(["tight", "tight", "medium", "medium", "wide", "wide"]);
  });
  test("an alert filter's step range holds exactly the band's bin steps", () => {
    const bands = ["tight", "medium", "wide"] as const;
    for (const binStep of [1, 20, 21, 80, 99, 100, 400]) {
      const inBand = bands.filter((step) => {
        const f = alertFilter({ minTvl: 0, minVolume: 0, minMcap: 0, maxMcap: 0, step });
        return alertable({ ...asFilterPool(pool({ name: "X-SOL" })), binStep }, f);
      });
      expect(inBand).toEqual([stepBand(binStep)]);
    }
  });
});

describe("warnings", () => {
  test("a clean pool has none, and a quote token's freeze authority is not flagged", () => {
    const p = pool({ name: "SOL-USDC" });
    p.tokenY = { ...p.tokenY, mint: USDC, freezable: true };
    expect(warnings(p)).toEqual([]);
  });
  test("blacklist, unverified, freezable, mintable, concentration and tags each show up", () => {
    const p = pool({ name: "RUG-SOL", blacklisted: true, tags: ["honeypot"] });
    p.tokenX = { ...p.tokenX, verified: false, freezable: true, mintable: true, topHolders: 50 };
    expect(warnings(p).map((w) => w.kind)).toEqual([
      "blacklisted",
      "unverified",
      "freezable",
      "mintable",
      "concentrated",
      "tag",
    ]);
  });
  test("holders below the threshold are not concentrated", () => {
    const p = pool({ name: "OK-SOL" });
    p.tokenX = { ...p.tokenX, topHolders: 49.9 };
    expect(warnings(p)).toEqual([]);
  });
});

describe("screen", () => {
  const pools = [
    pool({ name: "A-SOL", feeTvl: flat(0.01), tvl: 5_000, volume: flat(9_000 / 24), binStep: 100 }),
    pool({ name: "B-SOL", feeTvl: flat(0.05), tvl: 50_000, volume: flat(2_000 / 24), binStep: 20 }),
    pool({
      name: "C-USDC",
      feeTvl: flat(0.03),
      tvl: 80_000,
      volume: flat(90_000 / 24),
      binStep: 50,
      blacklisted: true,
    }),
    pool({ name: "D-USDC", feeTvl: flat(0), tvl: 20_000, volume: flat(20_000 / 24), binStep: 80 }),
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
  test("market cap bounds use the non-quote token, and a pool with no market cap only passes with no bound", () => {
    const capped = (name: string, cap: number | null) => {
      const p = pool({ name });
      p.tokenX = { ...p.tokenX, marketCap: cap };
      return p;
    };
    const list = [capped("S-SOL", 200_000), capped("M-SOL", 5_000_000), capped("L-SOL", 2e9), capped("N-SOL", null)];
    expect(names(screen(list, { ...open, minMcap: 1_000_000 }, "name", "asc"))).toEqual(["L-SOL", "M-SOL"]);
    expect(names(screen(list, { ...open, maxMcap: 10_000_000 }, "name", "asc"))).toEqual(["M-SOL", "S-SOL"]);
    expect(screen(list, open, "name", "asc")).toHaveLength(4);
  });
  test("the volume sort follows the chosen window", () => {
    const list = [
      pool({ name: "DAY-SOL", volume: { ...flat(100), "1h": 1 } }),
      pool({ name: "HOUR-SOL", volume: { ...flat(1), "1h": 500 } }),
    ];
    expect(names(screen(list, open, "volume", "desc"))[0]).toBe("DAY-SOL");
    expect(names(screen(list, { ...open, window: "1h" }, "volume", "desc"))[0]).toBe("HOUR-SOL");
  });
  test("a pool with no value for the sort column is last in both directions", () => {
    expect(names(screen(pools, open, "momentum", "desc")).at(-1)).toBe("D-USDC");
    expect(names(screen(pools, open, "momentum", "asc")).at(-1)).toBe("D-USDC");
    const flows = [pool({ name: "E-SOL", stats: { ...STATS, netDeposits: -5 } }), ...pools];
    expect(names(screen(flows, open, "netDeposits", "asc"))[0]).toBe("E-SOL");
    expect(names(screen(flows, open, "netDeposits", "desc"))[0]).toBe("E-SOL");
  });
});

test("totals add up the listed pools and weight Fee/TVL by TVL", () => {
  const t = totals([
    pool({ name: "A-SOL", tvl: 100, fees24h: 1, volume: flat(10 / 24) }),
    pool({ name: "B-SOL", tvl: 300, fees24h: 1, volume: flat(30 / 24) }),
  ]);
  expect(t).toEqual({ tvl: 400, volume: 40, fees24h: 2, feeTvl: 0.5, turnover: 0.1, swaps: null, netDeposits: null });
  expect(totals([pool({ name: "A-SOL", volume: { ...flat(1), "1h": 7 } })], "1h").volume).toBe(7);
  expect(totals([]).feeTvl).toBeNull();
  const stats = (swaps: number, netDeposits: number) => ({ ...STATS, swaps, netDeposits });
  const flow = totals([
    pool({ name: "A-SOL", stats: stats(10, -500) }),
    pool({ name: "B-SOL", stats: stats(5, 200) }),
    pool({ name: "C-SOL" }),
  ]);
  expect([flow.swaps, flow.netDeposits]).toEqual([15, -300]);
});
