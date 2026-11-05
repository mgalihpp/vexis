import { describe, expect, test } from "bun:test";
import {
  filterWallets,
  groupByOwner,
  inRangeStatus,
  type PnlFilter,
  type RangeFilter,
  rangeBar,
  sumKnown,
  type TrackedPosition,
} from "./tracked";

describe("filterWallets", () => {
  const wallets = () =>
    groupByOwner([
      pos({ address: "PosA1", owner: "AliceWallet", inRange: true, pnlUsd: 10 }),
      pos({ address: "PosB1", owner: "BobWallet", inRange: false, pnlUsd: -5 }),
      pos({ address: "PosC1", owner: "CarolWallet", inRange: true, pnlUsd: 3 }),
      pos({ address: "PosC2", owner: "CarolWallet", inRange: false, pnlUsd: 1 }),
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

describe("rangeBar", () => {
  test("puts an active bin inside the range between the range's edges", () => {
    const bar = rangeBar(100, 109, 104);
    expect(bar.side).toBe("inside");
    expect(bar.outside).toBe(0);
    expect(bar.start).toBeGreaterThan(0);
    expect(bar.end).toBeLessThan(1);
    expect(bar.active).toBeGreaterThan(bar.start);
    expect(bar.active).toBeLessThan(bar.end);
  });

  test("keeps a price below the range on the bar and counts the bins to the range", () => {
    const bar = rangeBar(100, 109, 90);
    expect(bar.side).toBe("below");
    expect(bar.outside).toBe(10);
    expect(bar.active).toBeGreaterThan(0);
    expect(bar.active).toBeLessThan(bar.start);
  });

  test("keeps a price above the range on the bar", () => {
    const bar = rangeBar(100, 109, 130);
    expect(bar.side).toBe("above");
    expect(bar.outside).toBe(21);
    expect(bar.active).toBeGreaterThan(bar.end);
    expect(bar.active).toBeLessThan(1);
  });

  test("treats both edge bins as inside", () => {
    expect(rangeBar(100, 109, 100).side).toBe("inside");
    expect(rangeBar(100, 109, 109).side).toBe("inside");
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
      pos({ address: "p1", owner: "A", pnlUsd: 10 }),
      pos({ address: "p2", owner: "A", pnlUsd: -4 }),
      pos({ address: "p3", owner: "A", pnlUsd: null }),
    ]);
    expect(wallet?.pnlUsd).toBe(6);
  });

  test("a wallet with no PnL values reports null, not zero", () => {
    const [wallet] = groupByOwner([pos({ address: "p1", owner: "A" })]);
    expect(wallet?.pnlUsd).toBeNull();
  });
});
