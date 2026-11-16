import DLMM from "@meteora-ag/dlmm";
import {
  DlmmSingleSided,
  estimateDlmmDirectSwap,
  getLbPairState,
  Zap,
  type ZapConfig,
  type ZapInDlmmResponse,
} from "@meteora-ag/zap-sdk";
import { Keypair, PublicKey, type Transaction } from "@solana/web3.js";
import type { AutoRebalanceConfig } from "@vexis/db/agents";
import BN from "bn.js";
import { ataBalance, executeSweepToSol } from "./fee-execute.ts";
import { solToLamports, WSOL_MINT } from "./fees.ts";
import { type Balances, planOpen, received, solSide } from "./open-close.ts";
import { SWAP_CU_BUFFER_MULTIPLIER, SWAP_CU_MIN_LIMIT, sendTransaction } from "./send.ts";
import { ensureUserTokenAccounts, missingBinArrayTransaction, toStrategyType, type ZapContext } from "./zap-execute.ts";

// Opening a new position from SOL and closing one back to SOL, for the office's Executor. The open is zap-sdk's zap-in
// for an uninitialized position (the engine the Meteora UI uses, like the rebalance); the close is the DLMM SDK's
// remove-all with claim and close, then optionally a Jupiter swap of what the close returned. Every leg goes through
// `sendTransaction`.

export type OpenRequest = {
  readonly poolAddress: string;
  readonly strategy: AutoRebalanceConfig["strategy"];
  readonly lowerBin: number;
  readonly upperBin: number;
  readonly amountSol: number;
  /** Deposit only SOL, on its own side of the pair; otherwise the zap swaps part of it for the other token. */
  readonly singleSidedSol: boolean;
  readonly slippageBps: number;
  /** Native SOL the open leaves in the wallet. */
  readonly reserveLamports: bigint;
};

export type OpenResult = { readonly positionAddress: string; readonly signature: string };

export type CloseRequest = {
  readonly poolAddress: string;
  readonly positionAddress: string;
  /** Swap what the close returned of the non-SOL token back to SOL through Jupiter. */
  readonly swapToSol: boolean;
  readonly slippageBps: number;
};

export type CloseResult = {
  readonly signature: string;
  /** The non-SOL token the close put in the wallet, in raw units, before any swap. The SOL side is unwrapped, so 0. */
  readonly received: Balances;
  readonly swapSignature: string | null;
  /** The close stands when the swap back fails; the tokens stay in the wallet. */
  readonly swapError: string | null;
};

// Jupiter routing account cap, the zap engine's documented example.
const ZAP_IN_MAX_ACCOUNTS = 50;
// Bins the active bin may move between the build and landing before the zap-in refuses.
const MAX_ACTIVE_BIN_SLIPPAGE = 3;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const send = (ctx: ZapContext, tx: Transaction, label: string, extraSigners: readonly Keypair[] = []) =>
  sendTransaction({
    connection: ctx.connection,
    signer: ctx.signer,
    extraSigners,
    tx,
    label,
    log: ctx.log,
    priorityLevel: ctx.priorityLevel,
    ...(label.startsWith("swap")
      ? { cuBufferMultiplier: SWAP_CU_BUFFER_MULTIPLIER, cuMinLimit: SWAP_CU_MIN_LIMIT }
      : {}),
  });

/** Opens a new position with `amountSol` and resolves to its address and the zap-in signature. */
export async function executeOpenPosition(ctx: ZapContext, request: OpenRequest): Promise<OpenResult> {
  const lbPair = new PublicKey(request.poolAddress);
  const pair = await getLbPairState(ctx.connection, lbPair);
  const amountLamports = solToLamports(request.amountSol);
  const plan = planOpen({
    lowerBin: request.lowerBin,
    upperBin: request.upperBin,
    activeBin: pair.activeId,
    side: solSide(pair.tokenXMint.toBase58(), pair.tokenYMint.toBase58()),
    singleSidedSol: request.singleSidedSol,
    amountLamports,
    nativeLamports: BigInt(await ctx.connection.getBalance(ctx.signer.publicKey)),
    reserveLamports: request.reserveLamports,
  });
  if (!plan.ok) throw new Error(`open refused: ${plan.reason}`);

  // The zap build reads both token accounts.
  await ensureUserTokenAccounts(ctx, lbPair);
  const config: ZapConfig = ctx.jupiterApiKey ? { jupiterApiKey: ctx.jupiterApiKey } : {};
  const estimate = await estimateDlmmDirectSwap({
    amountIn: new BN(amountLamports.toString()),
    inputTokenMint: new PublicKey(WSOL_MINT),
    lbPair,
    connection: ctx.connection,
    swapSlippageBps: request.slippageBps,
    minDeltaId: plan.minDeltaId,
    maxDeltaId: plan.maxDeltaId,
    strategy: toStrategyType(request.strategy),
    ...(plan.singleSided === null
      ? {}
      : { singleSided: plan.singleSided === "x" ? DlmmSingleSided.X : DlmmSingleSided.Y }),
    config,
  });
  const zap = new Zap(ctx.connection, config);
  const params = await zap.getZapInDlmmDirectParams({
    user: ctx.signer.publicKey,
    directSwapEstimate: estimate.result,
    maxActiveBinSlippage: MAX_ACTIVE_BIN_SLIPPAGE,
    favorXInActiveId: false,
    maxAccounts: ZAP_IN_MAX_ACCOUNTS,
    maxTransferAmountExtendPercentage: 0,
    ...estimate.context,
  });
  const position = Keypair.generate();
  const response: ZapInDlmmResponse = await zap.buildZapInDlmmTransaction({
    ...params,
    position: position.publicKey,
  });
  const positionAddress = position.publicKey.toBase58();
  ctx.log.info(`open ${positionAddress}: ${request.amountSol} SOL in ${request.lowerBin}..${request.upperBin}`);

  if (response.setupTransaction) await send(ctx, response.setupTransaction, "open-setup");
  for (const [i, tx] of response.swapTransactions.entries()) await send(ctx, tx, `swap-${i + 1}`);
  await send(ctx, response.ledgerTransaction, "open-ledger");
  const extra = await missingBinArrayTransaction(ctx, lbPair, () => [request.lowerBin, request.upperBin]);
  if (extra) await send(ctx, extra, "init-bin-array-extra");
  // The zap program initializes the position, so its new keypair co-signs this leg.
  const signature = await send(ctx, response.zapInTransaction, "zap-in", [position]);
  try {
    await send(ctx, response.cleanUpTransaction, "open-clean-up");
  } catch (error) {
    // The position is open; a failed clean-up only leaves the zap ledger and wrapped SOL to reclaim.
    ctx.log.warn(`clean-up after the open failed: ${messageOf(error)}`);
  }
  return { positionAddress, signature };
}

/**
 * Removes all liquidity, claims fees and rewards and closes the position, then swaps what came back of the non-SOL
 * side to SOL when asked. Resolves to the close's last signature.
 */
export async function executeClosePosition(ctx: ZapContext, request: CloseRequest): Promise<CloseResult> {
  const lbPair = new PublicKey(request.poolAddress);
  const positionKey = new PublicKey(request.positionAddress);
  const owner = ctx.signer.publicKey;
  const dlmm = await DLMM.create(ctx.connection, lbPair);
  const position = await dlmm.getPosition(positionKey);
  await ensureUserTokenAccounts(ctx, lbPair);
  const mintX = dlmm.lbPair.tokenXMint;
  const mintY = dlmm.lbPair.tokenYMint;
  // The close unwraps SOL into the native balance and may close the wSOL account, so that side is never read.
  const balanceOf = (mint: PublicKey) => (mint.toBase58() === WSOL_MINT ? Promise.resolve(0n) : ataBalance(ctx, mint));
  const balances = async (): Promise<Balances> => ({ x: await balanceOf(mintX), y: await balanceOf(mintY) });
  const before = await balances();

  const { lowerBinId, upperBinId, totalXAmount, totalYAmount } = position.positionData;
  const empty = totalXAmount === "0" && totalYAmount === "0";
  const txs = empty
    ? [...(await dlmm.claimAllRewardsByPosition({ owner, position })), await dlmm.closePosition({ owner, position })]
    : await dlmm.removeLiquidity({
        user: owner,
        position: positionKey,
        fromBinId: lowerBinId,
        toBinId: upperBinId,
        bps: new BN(10_000),
        shouldClaimAndClose: true,
      });
  let signature: string | undefined;
  for (const tx of txs) signature = await send(ctx, tx, empty ? "close-empty" : "close-remove");
  if (signature === undefined) throw new Error("close built no transactions");

  const got = received(before, await balances());
  ctx.log.info(`closed ${request.positionAddress}: received X=${got.x} Y=${got.y}`);
  if (!request.swapToSol) return { signature, received: got, swapSignature: null, swapError: null };
  try {
    const swapSignature = await executeSweepToSol(ctx, {
      poolAddress: request.poolAddress,
      feeX: got.x,
      feeY: got.y,
      slippageBps: request.slippageBps,
    });
    return { signature, received: got, swapSignature, swapError: null };
  } catch (error) {
    return { signature, received: got, swapSignature: null, swapError: messageOf(error) };
  }
}
