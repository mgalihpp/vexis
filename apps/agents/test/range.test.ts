import { describe, expect, test } from "bun:test";
import { type OnChainPosition, outOfRange, pickPosition, targetRange } from "../src/range.ts";

const pos = (address: string, funded = true): OnChainPosition => ({
  address,
  lowerBinId: 100,
  upperBinId: 120,
  funded,
});

describe("range", () => {
  test("pickPosition: exactly one funded position, never a guess between several", () => {
    expect(pickPosition([])._tag).toBe("none");
    expect(pickPosition([pos("A", false)])._tag).toBe("none");
    expect(pickPosition([pos("A"), pos("B", false)])).toEqual({ _tag: "one", position: pos("A") });
    expect(pickPosition([pos("A"), pos("B")])).toEqual({ _tag: "many", addresses: ["A", "B"] });
  });

  test("outOfRange: the edges are still in range", () => {
    expect([99, 100, 120, 121].map((active) => outOfRange(active, pos("A")))).toEqual([true, false, false, true]);
  });

  test("targetRange: current width re-centered, or a fixed half width", () => {
    expect(targetRange({ halfWidth: null }, 130, pos("A"))).toEqual({ lowerBinId: 120, upperBinId: 140 });
    expect(targetRange({ halfWidth: null }, 50, { lowerBinId: 7, upperBinId: 7 })).toEqual({
      lowerBinId: 49,
      upperBinId: 51,
    });
    expect(targetRange({ halfWidth: 34 }, 130, pos("A"))).toEqual({ lowerBinId: 96, upperBinId: 164 });
  });
});
