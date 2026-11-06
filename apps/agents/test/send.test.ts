import { describe, expect, test } from "bun:test";
import { StrategyType } from "@meteora-ag/dlmm";
import { type DlmmDirectRebalanceEstimate, DlmmSwapType } from "@meteora-ag/zap-sdk";
import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";
import { leadingFailures } from "../src/Db.ts";
import {
  anchorErrorContext,
  buildComputeBudgetInstructions,
  COMPUTE_BUDGET_PROGRAM_ID,
  computeUnitLimitWithBuffer,
  isRetryableSimulationError,
  parsePriorityFeeEstimate,
  priorityFeeOptions,
  resolveCuLimit,
  SendFailure,
  SWAP_CU_MIN_LIMIT,
} from "../src/send.ts";
import { walletSigner } from "../src/wallet.ts";
import { describeZapSwap, toStrategyType } from "../src/zap-execute.ts";

// Ported from auto-rebalance-dlmm-bot `test/send.test.ts` and `test/zap-preview.test.ts`; offline only.

describe("compute unit limit", () => {
  test("adds a 10% buffer, clamps to 1.4M, takes the swap leg's multiplier", () => {
    expect(computeUnitLimitWithBuffer(1000)).toBe(1100);
    expect(computeUnitLimitWithBuffer(2_000_000)).toBe(1_400_000);
    expect(computeUnitLimitWithBuffer(40167, 1.5)).toBe(Math.ceil(40167 * 1.5));
  });

  test("rejects non-positive input", () => {
    for (const [units, mult] of [
      [0, 1.1],
      [-5, 1.1],
      [Number.NaN, 1.1],
      [1000, 0],
      [1000, -1],
    ] as const) {
      expect(() => computeUnitLimitWithBuffer(units, mult)).toThrow(SendFailure);
    }
  });

  test("swap floor: small sims clamp up, large ones keep their buffered value", () => {
    // Regression: sim 40166 * 1.5 = 60249 still failed on-chain.
    expect(resolveCuLimit(40166, 1.5, SWAP_CU_MIN_LIMIT)).toBe(400_000);
    expect(resolveCuLimit(500_000, 1.5, SWAP_CU_MIN_LIMIT)).toBe(750_000);
    expect(resolveCuLimit(1000)).toBe(1100);
    for (const floor of [0, 1_400_001, 1.5]) expect(() => resolveCuLimit(1000, 1.1, floor)).toThrow(SendFailure);
  });

  test("budget instructions: no price instruction at zero fee, both above it", () => {
    expect(buildComputeBudgetInstructions(200_000, 0)).toHaveLength(1);
    const both = buildComputeBudgetInstructions(200_000, 5000);
    expect(both.map((ix) => ix.programId.toBase58())).toEqual([COMPUTE_BUDGET_PROGRAM_ID, COMPUTE_BUDGET_PROGRAM_ID]);
    expect(() => buildComputeBudgetInstructions(0, 0)).toThrow(SendFailure);
  });
});

describe("priority fee", () => {
  test("floors the Helius estimate; unknown shapes fall back to zero", () => {
    expect(parsePriorityFeeEstimate({ result: { priorityFeeEstimate: 1234.9 } })).toBe(1234);
    for (const payload of [null, {}, { result: {} }, { result: { priorityFeeEstimate: -10 } }]) {
      expect(parsePriorityFeeEstimate(payload)).toBe(0);
    }
  });

  test("Auto sends `recommended` alone, never combined with a level", () => {
    expect(priorityFeeOptions("Auto")).toEqual({ recommended: true });
    expect(priorityFeeOptions("High")).toEqual({ priorityLevel: "High" });
  });
});

describe("simulation errors", () => {
  test("stale blockhash retries, program failures do not", () => {
    for (const e of ["BlockhashNotFound", { err: "BlockhashNotFound" }, "blockhash not found", "blockhash expired"]) {
      expect(isRetryableSimulationError(e)).toBe(true);
    }
    for (const e of ["InstructionError", null, undefined]) expect(isRetryableSimulationError(e)).toBe(false);
  });

  const anchorLine =
    "AnchorError caused by account: user_token_x. Error Code: AccountOwnedByWrongProgram. Error Number: 3007.";

  test("keeps the failing account and both owner programs, nothing else", () => {
    const logs = [
      "Program 11111111111111111111111111111111 invoke [1]",
      `Program log: ${anchorLine}`,
      "Program log: Left:",
      "Program log: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      "Program log: Right:",
      "Program log: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ];
    expect(anchorErrorContext(logs)).toBe(
      `${anchorLine} | Left: TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb | Right: TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`,
    );
    expect(anchorErrorContext([`Program log: ${anchorLine}`])).toBe(anchorLine);
    for (const logs of [["Program log: Instruction: Swap"], [], null, undefined]) {
      expect(anchorErrorContext(logs)).toBeNull();
    }
  });
});

describe("zap", () => {
  const estimate = (
    swapType: DlmmSwapType,
    swapAmount: string,
    expectedOutput: string,
  ): DlmmDirectRebalanceEstimate => ({
    result: {
      swapType,
      swapAmount: new BN(swapAmount),
      expectedOutput: new BN(expectedOutput),
      postSwapX: new BN("902690000"),
      postSwapY: new BN("756000000"),
      quote: null,
    },
    context: {
      lbPair: PublicKey.default,
      position: PublicKey.default,
      swapSlippageBps: 50,
      minDeltaId: -2,
      maxDeltaId: 2,
      strategy: StrategyType.Spot,
    },
  });

  test("describes the balancing swap", () => {
    expect(describeZapSwap(estimate(DlmmSwapType.XToY, "671350000", "559000000"))).toBe(
      "X -> Y amount=671350000 expectedOut=559000000",
    );
    expect(describeZapSwap(estimate(DlmmSwapType.YToX, "1000000", "990000"))).toBe(
      "Y -> X amount=1000000 expectedOut=990000",
    );
    expect(describeZapSwap(estimate(DlmmSwapType.NoSwap, "0", "0"))).toBe("none");
  });

  test("maps each config strategy to the SDK's", () => {
    expect([toStrategyType("Spot"), toStrategyType("Curve"), toStrategyType("BidAsk")]).toEqual([
      StrategyType.Spot,
      StrategyType.Curve,
      StrategyType.BidAsk,
    ]);
  });
});

describe("wallet signer", () => {
  test("only a 64-byte key whose public key is the stored one signs", () => {
    const keypair = Keypair.generate();
    const secret = bs58.encode(keypair.secretKey);
    const publicKey = keypair.publicKey.toBase58();
    expect(walletSigner(secret, publicKey)?.publicKey.toBase58()).toBe(publicKey);
    expect(walletSigner(secret, Keypair.generate().publicKey.toBase58())).toBeNull();
    expect(walletSigner(bs58.encode(keypair.secretKey.slice(0, 32)), publicKey)).toBeNull();
    expect(walletSigner("not base58 0OIl", publicKey)).toBeNull();
  });
});

describe("failure streak", () => {
  test("counts failures from the newest until the first row that did not fail", () => {
    expect(leadingFailures([])).toBe(0);
    expect(leadingFailures([{ txError: "a" }, { txError: "b" }])).toBe(2);
    expect(leadingFailures([{ txError: "a" }, { txError: null }, { txError: "b" }])).toBe(1);
    expect(leadingFailures([{ txError: null }, { txError: "a" }])).toBe(0);
  });
});
