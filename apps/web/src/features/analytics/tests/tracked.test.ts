import { describe, expect, test } from "bun:test";
import {
  filterWallets,
  groupByOwner,
  inRangeStatus,
  type PnlFilter,
  type PositionBin,
  positionBars,
  type RangeFilter,
  sortByLiquidity,
  sumKnown,
  type TrackedPosition,
} from "../tracked";

describe("filterWallets", () => {
  const wallets = () =>
    groupByOwner([
      pos({ address: "PosA1", owner: "AliceWallet", inRange: true, pnlSol: 10 }),
      pos({ address: "PosB1", owner: "BobWallet", inRange: false, pnlSol: -5 }),
      pos({ address: "PosC1", owner: "CarolWallet", inRange: true, pnlSol: 3 }),
      pos({ address: "PosC2", owner: "CarolWallet", inRange: false, pnlSol: 1 }),
    ]);
  const owners = (query: string, range: RangeFilter[] = [], pnl: PnlFilter[] = []) =>
    filterWallets(wallets(), { query, range: new Set(range), pnl: new Set(pnl) })
      .map((w) => w.owner)
      .sort();

  test("keeps every wallet with no filter", () => {
    expect(owners("")).toEqual(["AliceWallet", "BobWallet", "CarolWallet"]);
  });

  test("searches wallet and position addresses, any case", () => {
    expect(owners("bob")).toEqual(["BobWallet"]);
    expect(owners("posc2")).toEqual(["CarolWallet"]);
    expect(owners("nobody")).toEqual([]);
  });

  test("range keeps wallets with at least one position in the picked state", () => {
    expect(owners("", ["out"])).toEqual(["BobWallet", "CarolWallet"]);
    expect(owners("", ["in"])).toEqual(["AliceWallet", "CarolWallet"]);
    expect(owners("", ["in", "out"])).toEqual(["AliceWallet", "BobWallet", "CarolWallet"]);
  });

  test("pnl filters on the wallet's total sign, combined with the other filters", () => {
    expect(owners("", [], ["loss"])).toEqual(["BobWallet"]);
    expect(owners("", ["out"], ["profit"])).toEqual(["CarolWallet"]);
  });
});

describe("sortByLiquidity", () => {
  test("largest first, unknown last, ties keep their order", () => {
    const rows = [
      { id: "a", v: 5 },
      { id: "b", v: null },
      { id: "c", v: 50 },
      { id: "d", v: 5 },
      { id: "e", v: 0 },
    ];
    expect(sortByLiquidity(rows, (r) => r.v).map((r) => r.id)).toEqual(["c", "a", "d", "e", "b"]);
  });
});

const pos = (over: Partial<TrackedPosition> & Pick<TrackedPosition, "address" | "owner">): TrackedPosition => ({
  createdAt: null,
  lowerBinId: null,
  upperBinId: null,
  activeBinId: null,
  minPrice: null,
  maxPrice: null,
  inRange: null,
  depositX: null,
  depositY: null,
  liquidityUsd: null,
  liquiditySol: null,
  feesUsd: null,
  feesSol: null,
  unclaimedUsd: null,
  unclaimedSol: null,
  pnlUsd: null,
  pnlSol: null,
  ...over,
});

describe("inRangeStatus", () => {
  test("trusts Meteora's out-of-range flag over the bins", () => {
    expect(inRangeStatus({ outOfRange: true, activeBinId: 10, lowerBinId: 0, upperBinId: 20 })).toBe(false);
    expect(inRangeStatus({ outOfRange: false, activeBinId: 99, lowerBinId: 0, upperBinId: 20 })).toBe(true);
  });

  test("compares the active bin against the range, both ends inclusive", () => {
    const range = { lowerBinId: 100, upperBinId: 110 };
    expect(inRangeStatus({ outOfRange: null, activeBinId: 100, ...range })).toBe(true);
    expect(inRangeStatus({ outOfRange: undefined, activeBinId: 110, ...range })).toBe(true);
    expect(inRangeStatus({ outOfRange: null, activeBinId: 111, ...range })).toBe(false);
    expect(inRangeStatus({ outOfRange: null, activeBinId: 99, ...range })).toBe(false);
  });

  test("is unknown when the flag and the bins are both missing", () => {
    expect(inRangeStatus({ outOfRange: null, activeBinId: null, lowerBinId: 1, upperBinId: 2 })).toBeNull();
    expect(inRangeStatus({ outOfRange: null, activeBinId: 1, lowerBinId: null, upperBinId: 2 })).toBeNull();
  });
});

describe("sumKnown", () => {
  test("skips unknown values and stays null when nothing is known", () => {
    expect(sumKnown([1.5, null, 2])).toBe(3.5);
    expect(sumKnown([null, null])).toBeNull();
    expect(sumKnown([])).toBeNull();
  });

  test("a known zero is a value, not an absence", () => {
    expect(sumKnown([0, null])).toBe(0);
  });
});

describe("groupByOwner", () => {
  test("puts each owner's positions together and never mixes wallets", () => {
    const wallets = groupByOwner([
      pos({ address: "p1", owner: "A" }),
      pos({ address: "p2", owner: "B" }),
      pos({ address: "p3", owner: "A" }),
    ]);
    expect(wallets.map((w) => w.owner)).toEqual(["A", "B"]);
    expect(wallets[0]?.positions.map((p) => p.address)).toEqual(["p1", "p3"]);
    expect(wallets[1]?.positions.map((p) => p.address)).toEqual(["p2"]);
  });

  test("orders wallets by position count, then owner, and positions newest first", () => {
    const wallets = groupByOwner([
      pos({ address: "old", owner: "Z", createdAt: 1 }),
      pos({ address: "new", owner: "Z", createdAt: 3 }),
      pos({ address: "mid", owner: "Z", createdAt: 2 }),
      pos({ address: "solo", owner: "A" }),
    ]);
    expect(wallets.map((w) => w.owner)).toEqual(["Z", "A"]);
    expect(wallets[0]?.positions.map((p) => p.address)).toEqual(["new", "mid", "old"]);
  });

  test("sums a wallet's PnL over the positions that have one", () => {
    const [wallet] = groupByOwner([
      pos({ address: "p1", owner: "A", pnlSol: 10 }),
      pos({ address: "p2", owner: "A", pnlSol: -4 }),
      pos({ address: "p3", owner: "A", pnlSol: null }),
    ]);
    expect(wallet?.pnlSol).toBe(6);
  });

  test("a wallet with no PnL values reports null, not zero", () => {
    const [wallet] = groupByOwner([pos({ address: "p1", owner: "A" })]);
    expect(wallet?.pnlSol).toBeNull();
  });
});

describe("positionBars", () => {
  const bins = (ids: number[]): PositionBin[] => ids.map((id) => ({ id, price: id / 10, x: 1, y: 2 }));

  test("one bar per bin while they fit, split by side of the active bin", () => {
    const bars = positionBars(bins([8, 9, 10, 11]), 10, 10);
    expect(bars.map((b) => [b.id, b.side])).toEqual([
      [8, "below"],
      [9, "below"],
      [10, "active"],
      [11, "above"],
    ]);
  });

  test("merged bars never cross the active bin and keep the token totals", () => {
    const ids = Array.from({ length: 21 }, (_, i) => i);
    const bars = positionBars(bins(ids), 10, 5);
    expect(bars.length).toBeLessThanOrEqual(5 + 2);
    expect(bars.filter((b) => b.side === "active")).toHaveLength(1);
    for (const b of bars) {
      if (b.side === "below") expect(b.lastId).toBeLessThan(10);
      if (b.side === "above") expect(b.id).toBeGreaterThan(10);
    }
    expect(bars.reduce((n, b) => n + b.x, 0)).toBe(21);
    expect(bars.reduce((n, b) => n + b.count, 0)).toBe(21);
  });

  test("a position wholly below the active bin has no active or above bar", () => {
    const bars = positionBars(bins([1, 2, 3]), 50, 10);
    expect(bars.every((b) => b.side === "below")).toBe(true);
  });
});
