import { describe, expect, test } from "bun:test";
import { WSOL_MINT } from "../src/rebalance/fees.ts";
import { planOpen, received, solSide } from "../src/rebalance/open-close.ts";

const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const USDC = "EPjFWvd5wAvEdJ3uNnzTPdixyBUS2h5vYodx2M4vKn1v";
const SOL = 1_000_000_000n;

const open = (o: Partial<Parameters<typeof planOpen>[0]> = {}) =>
  planOpen({
    lowerBin: 90,
    upperBin: 110,
    activeBin: 100,
    side: "y",
    singleSidedSol: false,
    amountLamports: SOL,
    nativeLamports: 2n * SOL,
    reserveLamports: SOL / 10n,
    ...o,
  });

describe("solSide", () => {
  test.each([
    [JUP, WSOL_MINT, "y"],
    [WSOL_MINT, USDC, "x"],
    [JUP, USDC, null],
  ] as const)("%s / %s", (x, y, side) => {
    expect(solSide(x, y)).toBe(side);
  });
});

describe("planOpen", () => {
  test("turns absolute bins into deltas from the active bin now", () => {
    expect(open({ activeBin: 95 })).toEqual({ ok: true, minDeltaId: -5, maxDeltaId: 15, singleSided: null });
  });

  test("single-sided SOL deposits on the SOL side of the pair", () => {
    expect(open({ singleSidedSol: true, side: "x" })).toMatchObject({ ok: true, singleSided: "x" });
  });

  test("the deposit may leave exactly the reserve, never less", () => {
    expect(open({ nativeLamports: SOL + SOL / 10n }).ok).toBe(true);
    expect(open({ nativeLamports: SOL + SOL / 10n - 1n })).toMatchObject({ ok: false });
  });

  test.each([
    ["no SOL side", { side: null }],
    ["active bin left the range", { activeBin: 111 }],
    ["inverted range", { lowerBin: 111 }],
    ["wider than one position", { lowerBin: 30, upperBin: 100 }],
    ["nothing to deposit", { amountLamports: 0n }],
  ] as const)("refuses: %s", (_, o) => {
    expect(open(o).ok).toBe(false);
  });
});

describe("received", () => {
  test("only what the close added is the office's; a balance that fell counts zero", () => {
    expect(received({ x: 5n, y: 7n }, { x: 12n, y: 3n })).toEqual({ x: 7n, y: 0n });
  });
});
