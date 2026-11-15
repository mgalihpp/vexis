import DLMM from "@meteora-ag/dlmm";
import {
  buildJupiterSwapTransaction,
  getLbPairState,
  getOrCreateATAInstruction,
  getTokenAccountBalance,
  getTokenProgramFromMint,
  unwrapSOLInstruction,
  type ZapConfig,
} from "@meteora-ag/zap-sdk";
import { PublicKey, Transaction } from "@solana/web3.js";
import type { AutoRebalanceConfig } from "@vexis/db/agents";
import BN from "bn.js";
import { compoundSpendableBalance, compoundTopUpAmounts, planSweepLegs, type SweepLeg, WSOL_MINT } from "./fees.ts";
import { SWAP_CU_BUFFER_MULTIPLIER, SWAP_CU_MIN_LIMIT, sendTransaction } from "./send.ts";
import { toStrategyType, type ZapContext } from "./zap-execute.ts";

// The fee steps, ported from auto-rebalance-dlmm-bot `src/rebalance/fees.ts`, `reaccumulate.ts` and
// `executeCompoundTopUp` in `zap.ts`: claim in range, deposit claimed fees back into the position, or swap them to
// SOL. Each resolves to its last signature, or null when there was nothing to do.

export type ClaimRequest = { readonly poolAddress: string; readonly positionAddress: string };

export type CompoundRequest = ClaimRequest & {
  /** The fees that were claimed (by the zap or an in-range claim); a deposit never exceeds them. */
  readonly feeX: bigint;
  readonly feeY: bigint;
  readonly strategy: AutoRebalanceConfig["strategy"];
  readonly slippageBps: number;
  /** Native SOL the deposit leaves in the wallet. */
  readonly reserveLamports: bigint;
};

export type SweepRequest = {
  readonly poolAddress: string;
  readonly feeX: bigint;
  readonly feeY: bigint;
  readonly slippageBps: number;
};

// The DLMM SDK throws this exact message when the position has no fees.
const NO_FEE_TO_CLAIM = "No fee to claim";
// Jupiter routing account cap, the zap engine's own default.
const SWEEP_JUPITER_MAX_ACCOUNTS = 50;
// wSOL is the native mint on the classic token program.
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

const bn = (v: bigint) => new BN(v.toString());

const send = (ctx: ZapContext, tx: Transaction, label: string, swap = false) =>
  sendTransaction({
    connection: ctx.connection,
    signer: ctx.signer,
    tx,
    label,
    log: ctx.log,
    priorityLevel: ctx.priorityLevel,
    ...(swap ? { cuBufferMultiplier: SWAP_CU_BUFFER_MULTIPLIER, cuMinLimit: SWAP_CU_MIN_LIMIT } : {}),
  });

/** The wallet's balance of one mint. The claim (or the zap before it) already created the account. */
async function ataBalance(ctx: ZapContext, mint: PublicKey) {
  const owner = ctx.signer.publicKey;
  const program = await getTokenProgramFromMint(ctx.connection, mint);
  const { ataPubkey } = await getOrCreateATAInstruction(ctx.connection, mint, owner, owner, false, program);
  return BigInt(await getTokenAccountBalance(ctx.connection, ataPubkey));
}

/** Claims the position's fees to the wallet. Null when the SDK finds none. */
export async function executeClaimFees(ctx: ZapContext, request: ClaimRequest): Promise<string | null> {
  const dlmm = await DLMM.create(ctx.connection, new PublicKey(request.poolAddress));
  const position = await dlmm.getPosition(new PublicKey(request.positionAddress));
  let txs: Transaction[];
  try {
    txs = await dlmm.claimSwapFee({ owner: ctx.signer.publicKey, position });
  } catch (error) {
    if (error instanceof Error && error.message === NO_FEE_TO_CLAIM) return null;
    throw error;
  }
  let last: string | null = null;
  for (const tx of txs) last = await send(ctx, tx, "claim-fee");
  return last;
}

/** Deposits claimed fees into the position's current range. */
export async function executeCompoundTopUp(ctx: ZapContext, request: CompoundRequest): Promise<string | null> {
  if (request.feeX <= 0n && request.feeY <= 0n) return null;
  const lbPair = new PublicKey(request.poolAddress);
  const positionKey = new PublicKey(request.positionAddress);
  const pair = await getLbPairState(ctx.connection, lbPair);
  const native = BigInt(await ctx.connection.getBalance(ctx.signer.publicKey));
  const spendable = async (mint: PublicKey) =>
    compoundSpendableBalance(mint.toBase58(), await ataBalance(ctx, mint), native, request.reserveLamports);
  const amounts = compoundTopUpAmounts(
    request.feeX,
    request.feeY,
    await spendable(pair.tokenXMint),
    await spendable(pair.tokenYMint),
  );
  if (amounts === null) {
    ctx.log.info("compound skipped: the wallet holds none of the claimed fees above the reserve");
    return null;
  }
  const dlmm = await DLMM.create(ctx.connection, lbPair);
  const position = await dlmm.getPosition(positionKey);
  // DLMM add-liquidity slippage is a percentage (0-100), not bps.
  const tx = await dlmm.addLiquidityByStrategy({
    positionPubKey: positionKey,
    totalXAmount: bn(amounts.x),
    totalYAmount: bn(amounts.y),
    strategy: {
      minBinId: position.positionData.lowerBinId,
      maxBinId: position.positionData.upperBinId,
      strategyType: toStrategyType(request.strategy),
    },
    user: ctx.signer.publicKey,
    slippage: request.slippageBps / 100,
  });
  const signature = await send(ctx, tx, "compound-fees");
  ctx.log.info(`compounded fees X=${amounts.x} Y=${amounts.y}: ${signature}`);
  return signature;
}

async function sweepLeg(ctx: ZapContext, leg: SweepLeg, slippageBps: number): Promise<string | null> {
  const user = ctx.signer.publicKey;
  if (leg.kind === "unwrap") {
    const unwrap = unwrapSOLInstruction(user, user);
    if (!unwrap) return null;
    return send(ctx, new Transaction().add(unwrap), "sweep-unwrap");
  }
  const config: ZapConfig = ctx.jupiterApiKey ? { jupiterApiKey: ctx.jupiterApiKey } : {};
  let built: Awaited<ReturnType<typeof buildJupiterSwapTransaction>>;
  try {
    built = await buildJupiterSwapTransaction(
      user,
      new PublicKey(leg.mint),
      new PublicKey(WSOL_MINT),
      bn(leg.amount),
      SWEEP_JUPITER_MAX_ACCOUNTS,
      slippageBps,
      undefined,
      config,
    );
  } catch (error) {
    ctx.log.warn(
      `sweep of ${leg.mint} skipped: Jupiter quote failed (${error instanceof Error ? error.message : error})`,
    );
    return null;
  }
  const tx = new Transaction();
  const { ix: createWsol } = await getOrCreateATAInstruction(
    ctx.connection,
    new PublicKey(WSOL_MINT),
    user,
    user,
    false,
    TOKEN_PROGRAM_ID,
  );
  if (createWsol) tx.add(createWsol);
  tx.add(...built.transaction.instructions);
  const unwrap = unwrapSOLInstruction(user, user);
  if (unwrap) tx.add(unwrap);
  return send(ctx, tx, "sweep-swap", true);
}

/** Swaps claimed fees to SOL, never more than was claimed. The zap or an in-range claim already claimed them. */
export async function executeSweepToSol(ctx: ZapContext, request: SweepRequest): Promise<string | null> {
  if (request.feeX <= 0n && request.feeY <= 0n) return null;
  const pair = await getLbPairState(ctx.connection, new PublicKey(request.poolAddress));
  const legs = planSweepLegs({
    feeX: request.feeX,
    feeY: request.feeY,
    balX: await ataBalance(ctx, pair.tokenXMint),
    balY: await ataBalance(ctx, pair.tokenYMint),
    mintX: pair.tokenXMint.toBase58(),
    mintY: pair.tokenYMint.toBase58(),
  });
  if (legs === null) {
    ctx.log.info("sweep skipped: the wallet holds none of the claimed fees");
    return null;
  }
  let last: string | null = null;
  for (const leg of legs) last = (await sweepLeg(ctx, leg, request.slippageBps)) ?? last;
  return last;
}
