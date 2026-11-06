import DLMM, { getBinArraysRequiredByPositionRange, StrategyType } from "@meteora-ag/dlmm";
import {
  DLMM_PROGRAM_ID,
  type DlmmDirectRebalanceEstimate,
  DlmmSwapType,
  estimateDlmmRebalanceSwap,
  getLbPairState,
  getOrCreateATAInstruction,
  getTokenProgramFromMint,
  type RebalanceDlmmPositionResponse,
  Zap,
  type ZapConfig,
} from "@meteora-ag/zap-sdk";
import { type Connection, type Keypair, PublicKey, Transaction, type TransactionInstruction } from "@solana/web3.js";
import type { AutoRebalanceConfig } from "@vexis/db/agents";
import BN from "bn.js";
import {
  type PrioritySetting,
  type SendLog,
  SWAP_CU_BUFFER_MULTIPLIER,
  SWAP_CU_MIN_LIMIT,
  sendTransaction,
} from "./send.ts";

// The zap rebalance, ported from auto-rebalance-dlmm-bot `src/rebalance/zap.ts` (the same engine the Meteora UI
// uses): estimate the balancing swap off-chain for the new delta range, then remove -> swap -> zap-in on the
// existing position. Amounts stay in bn.js end to end.

export type ZapContext = {
  readonly connection: Connection;
  readonly signer: Keypair;
  readonly log: SendLog;
  readonly priorityLevel: PrioritySetting;
  readonly jupiterApiKey: string | undefined;
};

export type ZapRequest = {
  readonly poolAddress: string;
  readonly positionAddress: string;
  readonly strategy: AutoRebalanceConfig["strategy"];
  readonly slippageBps: number;
  /** Bins each side of the active bin the zap reads at estimate time. */
  readonly halfWidth: number;
};

export function toStrategyType(kind: AutoRebalanceConfig["strategy"]): StrategyType {
  switch (kind) {
    case "Spot":
      return StrategyType.Spot;
    case "Curve":
      return StrategyType.Curve;
    case "BidAsk":
      return StrategyType.BidAsk;
  }
}

export function describeZapSwap(estimate: DlmmDirectRebalanceEstimate): string {
  const result = estimate.result;
  if (result.swapType === DlmmSwapType.NoSwap) return "none";
  const arrow = result.swapType === DlmmSwapType.XToY ? "X -> Y" : "Y -> X";
  return `${arrow} amount=${result.swapAmount.toString()} expectedOut=${result.expectedOutput.toString()}`;
}

/** Legs in the order they must land. `zap-in` is preceded by any bin arrays zap-sdk assumes but nobody created. */
export const ZAP_LEGS = [
  "setup",
  "init-bin-array",
  "rebalance-position",
  "swap",
  "ledger",
  "zap-in",
  "clean-up",
] as const satisfies ReadonlyArray<string>;

const LEG_FIELD = {
  setup: "setupTransaction",
  "init-bin-array": "initBinArrayTransaction",
  "rebalance-position": "rebalancePositionTransaction",
  swap: "swapTransaction",
  ledger: "ledgerTransaction",
  "zap-in": "zapInTransaction",
  "clean-up": "cleanUpTransaction",
} as const satisfies Record<(typeof ZAP_LEGS)[number], keyof RebalanceDlmmPositionResponse>;

const send = (ctx: ZapContext, tx: Transaction, label: string) =>
  sendTransaction({
    connection: ctx.connection,
    signer: ctx.signer,
    tx,
    label,
    log: ctx.log,
    priorityLevel: ctx.priorityLevel,
    ...(label === "swap" ? { cuBufferMultiplier: SWAP_CU_BUFFER_MULTIPLIER, cuMinLimit: SWAP_CU_MIN_LIMIT } : {}),
  });

/**
 * DLMM's rebalance needs both user token accounts to exist; a wallet that never held one side fails simulation
 * with AccountNotInitialized (3012). The SDK helper resolves Token-2022 mints to the right program.
 */
async function ensureUserTokenAccounts(ctx: ZapContext, lbPair: PublicKey) {
  const owner = ctx.signer.publicKey;
  const pair = await getLbPairState(ctx.connection, lbPair);
  const instructions: TransactionInstruction[] = [];
  for (const mint of [pair.tokenXMint, pair.tokenYMint]) {
    const program = await getTokenProgramFromMint(ctx.connection, mint);
    const { ix } = await getOrCreateATAInstruction(ctx.connection, mint, owner, owner, false, program);
    if (ix) instructions.push(ix);
  }
  if (instructions.length === 0) return;
  const signature = await send(ctx, new Transaction().add(...instructions), "create-atas");
  ctx.log.info(`created ${instructions.length} missing token account(s): ${signature}`);
}

/**
 * zap-sdk hands the zap-in leg the bin array holding the range start plus the next one up, even when the range
 * never reaches it. An uninitialized one is owned by the System program and DLMM rejects the zap with Custom(3007),
 * not a missing-account error. Built right before zap-in, after the SDK's own init leg, so it never double-inits.
 */
async function missingBinArrayTransaction(ctx: ZapContext, lbPair: PublicKey, halfWidth: number) {
  const pair = await getLbPairState(ctx.connection, lbPair);
  const required = getBinArraysRequiredByPositionRange(
    lbPair,
    new BN(pair.activeId - halfWidth),
    new BN(pair.activeId + halfWidth),
    DLMM_PROGRAM_ID,
  );
  const infos = await ctx.connection.getMultipleAccountsInfo(required.map((r) => r.key));
  const missing = required.filter((_, i) => infos[i] == null);
  if (missing.length === 0) return null;
  const dlmm = await DLMM.create(ctx.connection, lbPair);
  const instructions: TransactionInstruction[] = [];
  for (const { key, index } of missing) {
    instructions.push(
      await dlmm.program.methods
        .initializeBinArray(index)
        .accountsPartial({ binArray: key, funder: ctx.signer.publicKey, lbPair })
        .instruction(),
    );
  }
  ctx.log.info(`bin arrays missing for the zap-in range: ${missing.map((m) => m.index.toString()).join(", ")}`);
  return new Transaction().add(...instructions);
}

/** Runs the whole rebalance and resolves to the last leg's signature. Rejects on the first leg that fails. */
export async function executeZapRebalance(ctx: ZapContext, request: ZapRequest): Promise<string> {
  if (!Number.isInteger(request.halfWidth) || request.halfWidth < 1 || request.halfWidth > 1024) {
    throw new Error(`invalid halfWidth: ${request.halfWidth}`);
  }
  const config: ZapConfig = ctx.jupiterApiKey ? { jupiterApiKey: ctx.jupiterApiKey } : {};
  const zap = new Zap(ctx.connection, config);
  const estimate = await estimateDlmmRebalanceSwap({
    lbPair: new PublicKey(request.poolAddress),
    position: new PublicKey(request.positionAddress),
    connection: ctx.connection,
    swapSlippageBps: request.slippageBps,
    minDeltaId: -request.halfWidth,
    maxDeltaId: request.halfWidth,
    strategy: toStrategyType(request.strategy),
    config,
  });
  const lbPair = estimate.context.lbPair;

  // Must come before the zap build: the SDK reads both ATAs while building.
  await ensureUserTokenAccounts(ctx, lbPair);
  const response = await zap.rebalanceDlmmPosition({
    user: ctx.signer.publicKey,
    liquiditySlippageBps: request.slippageBps,
    favorXInActiveId: false,
    directSwapEstimate: estimate.result,
    ...estimate.context,
  });
  const { currentBalances, afterSwap } = response.estimation;
  ctx.log.info(
    `zap estimate: balances X=${currentBalances.tokenX.toString()} Y=${currentBalances.tokenY.toString()}, ` +
      `after swap X=${afterSwap.tokenX.toString()} Y=${afterSwap.tokenY.toString()}, swap ${describeZapSwap(estimate)}`,
  );

  let last: string | undefined;
  for (const leg of ZAP_LEGS) {
    const tx = response[LEG_FIELD[leg]];
    if (!tx) continue;
    if (leg === "zap-in") {
      const extra = await missingBinArrayTransaction(ctx, lbPair, request.halfWidth);
      if (extra) last = await send(ctx, extra, "init-bin-array-extra");
    }
    last = await send(ctx, tx, leg);
  }
  if (last === undefined) throw new Error("zap built no transactions");
  return last;
}
