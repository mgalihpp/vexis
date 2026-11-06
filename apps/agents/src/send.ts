import {
  ComputeBudgetProgram,
  type Connection,
  type Keypair,
  type SignatureStatus,
  Transaction,
  type TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

// The send pipeline, ported from auto-rebalance-dlmm-bot `src/rebalance/send.ts`: simulate at 1.4M CU, limit
// `ceil(used * 1.1)` capped at 1.4M, Helius priority fee, `skipPreflight` send with poll and resend until the
// blockhash expires, up to 3 attempts with a fresh blockhash each. Do not "simplify" it to a static limit or
// preflight-on: both were tried there and failed on mainnet.

/** A failure that a fresh blockhash will not fix: simulation or on-chain error. */
export class SendFailure extends Error {}

/** Where the pipeline writes progress. Never handed a secret. */
export type SendLog = { readonly info: (message: string) => void; readonly warn: (message: string) => void };

export const SIMULATION_CU_LIMIT = 1_400_000;
export const MAX_CU_LIMIT = 1_400_000;
export const CU_BUFFER_MULTIPLIER = 1.1;
// A swap leg's CU at landing can far exceed its simulation (multi-hop Jupiter routes; seen sim 40166 with a
// 1.5x limit still failing on-chain), so the swap leg gets 50% headroom and a 400k floor. Still sim-based.
export const SWAP_CU_BUFFER_MULTIPLIER = 1.5;
export const SWAP_CU_MIN_LIMIT = 400_000;
export const COMPUTE_BUDGET_PROGRAM_ID = "ComputeBudget111111111111111111111111111111";

/** Helius `getPriorityFeeEstimate` levels, plus Auto (Helius picks via `{ recommended: true }`). */
export const PRIORITY_LEVELS = ["Min", "Low", "Medium", "High", "VeryHigh", "UnsafeMax"] as const;
export type PrioritySetting = (typeof PRIORITY_LEVELS)[number] | "Auto";
export const DEFAULT_PRIORITY_LEVEL: PrioritySetting = "High";

export const DEFAULT_POLL_MS = 1000;
export const DEFAULT_RESEND_MS = 2500;
export const MAX_SEND_ATTEMPTS = 3;
// Finalized is known to every node of a load-balanced RPC; the simulate also asks for `replaceRecentBlockhash`.
export const SIM_BLOCKHASH_COMMITMENT = "finalized" as const;
export const SIM_RETRY_DELAY_MS = 1000;

export type SendInput = {
  readonly connection: Connection;
  readonly signer: Keypair;
  readonly tx: Transaction;
  readonly label: string;
  readonly log: SendLog;
  readonly priorityLevel?: PrioritySetting;
  readonly cuBufferMultiplier?: number;
  readonly cuMinLimit?: number;
  readonly pollMs?: number;
  readonly resendMs?: number;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function computeUnitLimitWithBuffer(unitsConsumed: number, multiplier = CU_BUFFER_MULTIPLIER): number {
  if (!Number.isFinite(unitsConsumed) || unitsConsumed <= 0) {
    throw new SendFailure(`invalid unitsConsumed: ${String(unitsConsumed)}`);
  }
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new SendFailure(`invalid cuBufferMultiplier: ${String(multiplier)}`);
  }
  return Math.min(Math.max(Math.ceil(unitsConsumed * multiplier), 1), MAX_CU_LIMIT);
}

/** Buffer first, then clamp up to `minLimit`, then cap at `MAX_CU_LIMIT`. */
export function resolveCuLimit(unitsConsumed: number, multiplier = CU_BUFFER_MULTIPLIER, minLimit?: number): number {
  const buffered = computeUnitLimitWithBuffer(unitsConsumed, multiplier);
  if (minLimit === undefined) return buffered;
  if (!Number.isInteger(minLimit) || minLimit < 1 || minLimit > MAX_CU_LIMIT) {
    throw new SendFailure(`invalid cuMinLimit: ${String(minLimit)}`);
  }
  return Math.min(Math.max(buffered, minLimit), MAX_CU_LIMIT);
}

export function buildComputeBudgetInstructions(cuLimit: number, microLamports: number): TransactionInstruction[] {
  if (!Number.isInteger(cuLimit) || cuLimit < 1 || cuLimit > MAX_CU_LIMIT) {
    throw new SendFailure(`invalid cuLimit: ${String(cuLimit)}`);
  }
  const price = Number.isFinite(microLamports) ? Math.max(0, Math.floor(microLamports)) : 0;
  const instructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit })];
  if (price > 0) instructions.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: price }));
  return instructions;
}

export const stripComputeBudgetInstructions = (instructions: TransactionInstruction[]) =>
  instructions.filter((ix) => ix.programId.toBase58() !== COMPUTE_BUDGET_PROGRAM_ID);

/** The raw estimate when the payload carries a usable one, else undefined (non-Helius RPC or an API error). */
function rawEstimate(payload: unknown): number | undefined {
  if (typeof payload !== "object" || payload === null || !("result" in payload)) return undefined;
  const { result } = payload;
  if (typeof result !== "object" || result === null || !("priorityFeeEstimate" in result)) return undefined;
  const estimate = result.priorityFeeEstimate;
  return typeof estimate === "number" && Number.isFinite(estimate) ? estimate : undefined;
}

export function parsePriorityFeeEstimate(payload: unknown): number {
  return Math.max(0, Math.floor(rawEstimate(payload) ?? 0));
}

/** `recommended` cannot be combined with `priorityLevel` (Helius answers 400), so Auto sends it alone. */
export const priorityFeeOptions = (level: PrioritySetting) =>
  level === "Auto" ? { recommended: true } : { priorityLevel: level };

function feeErrorReason(payload: unknown): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const { error } = payload;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
      return `: ${error.message}`;
    }
  }
  return " (non-Helius RPC?)";
}

async function fetchPriorityFeeEstimate(
  rpcEndpoint: string,
  serializedTxBase58: string,
  level: PrioritySetting,
  log: SendLog,
): Promise<number> {
  try {
    const response = await fetch(rpcEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        method: "getPriorityFeeEstimate",
        params: [{ transaction: serializedTxBase58, options: priorityFeeOptions(level) }],
      }),
    });
    const payload: unknown = await response.json();
    // Helius legitimately answers 0 when quiet; only a payload with no estimate at all is worth a warning.
    if (rawEstimate(payload) === undefined) {
      log.warn(`getPriorityFeeEstimate returned no estimate${feeErrorReason(payload)}; continuing with 0 priority fee`);
    }
    return parsePriorityFeeEstimate(payload);
  } catch {
    log.warn("getPriorityFeeEstimate failed (non-Helius RPC?); continuing with 0 priority fee");
    return 0;
  }
}

const PROGRAM_LOG_PREFIX = "Program log: ";

/**
 * The failing account and both owner programs from an Anchor error in simulation logs, so a bare Custom(3007) or
 * Custom(3012) says what to fix. The rest of the logs stays out: this message reaches Telegram.
 */
export function anchorErrorContext(logs: readonly string[] | null | undefined): string | null {
  if (!logs || logs.length === 0) return null;
  const text = logs.map((line) => (line.startsWith(PROGRAM_LOG_PREFIX) ? line.slice(PROGRAM_LOG_PREFIX.length) : line));
  const start = text.findIndex((line) => line.includes("AnchorError caused by account"));
  if (start === -1) return null;
  const parts = [text[start] as string];
  for (const label of ["Left:", "Right:"] as const) {
    const at = text.indexOf(label, start + 1);
    const value = at === -1 ? undefined : text[at + 1];
    if (value) parts.push(`${label} ${value}`);
  }
  return parts.join(" | ");
}

/** Load-balanced RPCs can simulate on a node that has not seen the hash yet: retry with a fresh one. */
export function isRetryableSimulationError(error: unknown): boolean {
  let text: string;
  if (typeof error === "string") text = error;
  else if (error instanceof Error) text = error.message;
  else {
    try {
      const raw = JSON.stringify(error);
      if (typeof raw !== "string") return false;
      text = raw;
    } catch {
      return false;
    }
  }
  return /blockhash/i.test(text) && /not\s*found|expired/i.test(text);
}

/** Rebuild with a fresh blockhash and re-sign. Anything else throws `SendFailure` and aborts. */
class Retryable extends Error {}

const landed = (status: SignatureStatus | null | undefined) =>
  status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized";

/** Signs with `signer`, sends and waits for confirmation. Resolves to the signature; rejects with the reason. */
export async function sendTransaction(input: SendInput): Promise<string> {
  const { connection, signer, label, log } = input;
  const pollMs = input.pollMs ?? DEFAULT_POLL_MS;
  const resendMs = input.resendMs ?? DEFAULT_RESEND_MS;
  const priorityLevel = input.priorityLevel ?? DEFAULT_PRIORITY_LEVEL;
  const payer = signer.publicKey;
  const base = stripComputeBudgetInstructions(input.tx.instructions);
  if (base.length === 0) throw new SendFailure(`[${label}] transaction has no instructions`);

  let lastSignature: string | undefined;
  const sendOnce = async (attempt: number): Promise<string> => {
    // Simulate as a v0 message: web3.js's legacy path replaces the blockhash with its own cached one and takes no
    // RPC config. Unsigned on purpose; `replaceRecentBlockhash` rewrites the message anyway.
    const simBlockhash = (await connection.getLatestBlockhash(SIM_BLOCKHASH_COMMITMENT)).blockhash;
    const simInstructions = [ComputeBudgetProgram.setComputeUnitLimit({ units: SIMULATION_CU_LIMIT }), ...base];
    const simTx = new VersionedTransaction(
      new TransactionMessage({
        payerKey: payer,
        recentBlockhash: simBlockhash,
        instructions: simInstructions,
      }).compileToV0Message(),
    );
    const simulation = await connection.simulateTransaction(simTx, { replaceRecentBlockhash: true, sigVerify: false });
    if (simulation.value.err) {
      const raw = JSON.stringify(simulation.value.err);
      if (isRetryableSimulationError(raw)) throw new Retryable(`[${label}] simulation hit a stale blockhash: ${raw}`);
      const context = anchorErrorContext(simulation.value.logs);
      throw new SendFailure(`[${label}] simulation failed: ${raw}${context === null ? "" : ` (${context})`}`);
    }
    const unitsConsumed = simulation.value.unitsConsumed;
    if (unitsConsumed == null) throw new SendFailure(`[${label}] simulation returned no unitsConsumed`);
    const cuLimit = resolveCuLimit(unitsConsumed, input.cuBufferMultiplier ?? CU_BUFFER_MULTIPLIER, input.cuMinLimit);

    // Helius documents a signed legacy transaction for its fee API, so the probe keeps that shape.
    const probeTx = new Transaction().add(...simInstructions);
    probeTx.feePayer = payer;
    probeTx.recentBlockhash = simBlockhash;
    probeTx.sign(signer);
    const microLamports = await fetchPriorityFeeEstimate(
      connection.rpcEndpoint,
      bs58.encode(probeTx.serialize()),
      priorityLevel,
      log,
    );
    log.info(
      `[${label}] attempt ${attempt}/${MAX_SEND_ATTEMPTS}: used=${unitsConsumed} limit=${cuLimit} fee=${microLamports}uL(${priorityLevel}) ixs=${base.length}`,
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    const finalTx = new Transaction().add(...buildComputeBudgetInstructions(cuLimit, microLamports), ...base);
    finalTx.feePayer = payer;
    finalTx.recentBlockhash = blockhash;
    finalTx.sign(signer);
    const raw = finalTx.serialize();
    let signature: string;
    try {
      signature = await connection.sendRawTransaction(raw, { skipPreflight: true });
    } catch (error) {
      throw new Retryable(`[${label}] send failed: ${messageOf(error)}`);
    }
    lastSignature = signature;

    let lastSend = Date.now();
    for (;;) {
      let status: SignatureStatus | null | undefined;
      try {
        status = (await connection.getSignatureStatuses([signature]))?.value?.[0];
      } catch (error) {
        throw new Retryable(`[${label}] status check failed: ${messageOf(error)}`);
      }
      if (status?.err) {
        throw new SendFailure(
          `[${label}] transaction failed: ${JSON.stringify(status.err)} (sim used=${unitsConsumed} limit=${cuLimit})`,
        );
      }
      if (landed(status)) {
        log.info(`[${label}] confirmed: ${signature}`);
        return signature;
      }
      let height: number;
      try {
        height = await connection.getBlockHeight();
      } catch (error) {
        throw new Retryable(`[${label}] block height check failed: ${messageOf(error)}`);
      }
      if (height > lastValidBlockHeight) throw new Retryable(`[${label}] blockhash expired`);
      if (Date.now() - lastSend >= resendMs) {
        // Rebroadcast is best effort; keep polling until expiry.
        await connection.sendRawTransaction(raw, { skipPreflight: true }).catch(() => undefined);
        lastSend = Date.now();
      }
      await sleep(pollMs);
    }
  };

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
    try {
      if (lastSignature !== undefined) {
        // The previous attempt errored mid-flight but may still have landed: check before re-signing.
        const prior = await connection
          .getSignatureStatuses([lastSignature])
          .then((r) => r?.value?.[0])
          .catch(() => undefined);
        if (landed(prior)) {
          log.info(`[${label}] confirmed: ${lastSignature}`);
          return lastSignature;
        }
        if (prior?.err) throw new SendFailure(`[${label}] transaction failed: ${JSON.stringify(prior.err)}`);
      }
      return await sendOnce(attempt);
    } catch (error) {
      if (error instanceof SendFailure || attempt >= MAX_SEND_ATTEMPTS) throw error;
      log.warn(`[${label}] attempt ${attempt}/${MAX_SEND_ATTEMPTS} retryable, retrying: ${messageOf(error)}`);
      await sleep(SIM_RETRY_DELAY_MS);
    }
  }
  throw new SendFailure(`[${label}] failed after ${MAX_SEND_ATTEMPTS} attempts`);
}
