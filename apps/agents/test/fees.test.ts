import { describe, expect, test } from "bun:test";
import {
  compoundSpendableBalance,
  compoundTopUpAmounts,
  decimalRatio,
  feeValueInLamports,
  planSweepLegs,
  type SweepLeg,
  solToLamports,
  WSOL_MINT,
} from "../src/fees.ts";

const JUP = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const USDC = "EPjFWvd5wAvEdJ3uNnzTPdixyBUS2h5vYodx2M4vKn1v";

describe("decimalRatio", () => {
  test.each([
    ["0.5", { num: 5n, den: 10n }],
    ["12", { num: 12n, den: 1n }],
    ["1.5e-9", { num: 15n, den: 10_000_000_000n }],
    ["2e3", { num: 2000n, den: 1n }],
    ["-1", null],
    ["abc", null],
  ])("%s", (value, expected) => {
    expect(decimalRatio(value)).toEqual(expected);
  });
});

describe("feeValueInLamports", () => {
  test.each([
    [
      "SOL on Y: X fees priced at the active bin",
      { feeX: 1000n, feeY: 50n, mintX: JUP, mintY: WSOL_MINT, price: "0.25" },
      300n,
    ],
    [
      "SOL on X: Y fees divided by the price",
      { feeX: 50n, feeY: 1000n, mintX: WSOL_MINT, mintY: USDC, price: "4" },
      300n,
    ],
    ["exponent notation price", { feeX: 2_000_000_000n, feeY: 0n, mintX: JUP, mintY: WSOL_MINT, price: "1.5e-9" }, 3n],
    ["negative fees count as zero", { feeX: -5n, feeY: -5n, mintX: JUP, mintY: WSOL_MINT, price: "1" }, 0n],
    [
      "zero price on X side values Y at nothing",
      { feeX: 7n, feeY: 1000n, mintX: WSOL_MINT, mintY: USDC, price: "0" },
      7n,
    ],
    ["no SOL side has no value", { feeX: 1000n, feeY: 1000n, mintX: JUP, mintY: USDC, price: "1" }, null],
  ])("%s", (_, args, expected) => {
    expect(feeValueInLamports({ ...args, pricePerLamport: args.price })).toBe(expected);
  });
});

describe("compoundTopUpAmounts", () => {
  test.each([
    ["each side capped by the fee", [10n, 20n, 100n, 100n], { x: 10n, y: 20n }],
    ["each side capped by the balance", [10n, 20n, 4n, 5n], { x: 4n, y: 5n }],
    ["one side empty", [10n, 0n, 100n, 100n], { x: 10n, y: 0n }],
    ["negatives count as zero", [-1n, 20n, 100n, -3n], null],
    ["nothing to deposit", [0n, 0n, 100n, 100n], null],
  ] as const)("%s", (_, [feeX, feeY, balX, balY], expected) => {
    expect(compoundTopUpAmounts(feeX, feeY, balX, balY)).toEqual(expected);
  });
});

describe("compoundSpendableBalance", () => {
  const reserve = solToLamports(0.1);
  test.each([
    ["SOL side spends native SOL above the reserve", WSOL_MINT, 0n, solToLamports(0.35), solToLamports(0.25)],
    ["SOL side below the reserve spends nothing", WSOL_MINT, 999n, solToLamports(0.05), 0n],
    ["token side spends its account balance", USDC, 1234n, solToLamports(5), 1234n],
  ])("%s", (_, mint, ata, native, expected) => {
    expect(compoundSpendableBalance(mint, ata, native, reserve)).toBe(expected);
  });
});

describe("planSweepLegs", () => {
  const base = { balX: 1000n, balY: 1000n };
  test.each<[string, Parameters<typeof planSweepLegs>[0], SweepLeg[] | null]>([
    [
      "token fees swap, SOL fees unwrap first",
      { ...base, feeX: 10n, feeY: 20n, mintX: JUP, mintY: WSOL_MINT },
      [
        { mint: WSOL_MINT, amount: 20n, kind: "unwrap" },
        { mint: JUP, amount: 10n, kind: "swap" },
      ],
    ],
    [
      "capped by the wallet balance, so principal is never swept",
      { feeX: 50n, feeY: 0n, balX: 30n, balY: 0n, mintX: JUP, mintY: USDC },
      [{ mint: JUP, amount: 30n, kind: "swap" }],
    ],
    [
      "two wSOL sides merge into one unwrap",
      { ...base, feeX: 10n, feeY: 20n, mintX: WSOL_MINT, mintY: WSOL_MINT },
      [{ mint: WSOL_MINT, amount: 30n, kind: "unwrap" }],
    ],
    ["no fees, no legs", { ...base, feeX: 0n, feeY: -1n, mintX: JUP, mintY: USDC }, null],
  ])("%s", (_, args, expected) => {
    expect(planSweepLegs(args)).toEqual(expected);
  });
});
