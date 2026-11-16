import { WSOL_MINT } from "./fees.ts";

// What an office open or close may do, decided before anything is built. Raw lamports as bigint; nothing here reads
// the chain.

/** A DLMM position holds at most this many bins without an extension. */
export const MAX_POSITION_BINS = 70;

export type SolSide = "x" | "y";

/** Which side of the pair is SOL; null when neither is, and the office opens nothing there. */
export const solSide = (mintX: string, mintY: string): SolSide | null =>
  mintY === WSOL_MINT ? "y" : mintX === WSOL_MINT ? "x" : null;

export type OpenPlan =
  | {
      readonly ok: true;
      /** The range relative to the active bin now, as zap-sdk takes it. */
      readonly minDeltaId: number;
      readonly maxDeltaId: number;
      /** Deposit SOL alone on its side; null puts SOL on both sides through the zap's balancing swap. */
      readonly singleSided: SolSide | null;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * The zap-in for a new position, or why it must not be sent. The proposal's bins are absolute, so an active bin that
 * moved out of them refuses the open instead of shifting the range. The deposit never takes the wallet below the
 * reserve.
 */
export function planOpen(args: {
  readonly lowerBin: number;
  readonly upperBin: number;
  readonly activeBin: number;
  readonly side: SolSide | null;
  readonly singleSidedSol: boolean;
  readonly amountLamports: bigint;
  readonly nativeLamports: bigint;
  readonly reserveLamports: bigint;
}): OpenPlan {
  const { lowerBin, upperBin, activeBin } = args;
  if (args.side === null) return { ok: false, reason: "the pool has no SOL side" };
  if (args.amountLamports <= 0n) return { ok: false, reason: "nothing to deposit" };
  if (lowerBin > upperBin) return { ok: false, reason: `lower bin ${lowerBin} is above upper bin ${upperBin}` };
  if (upperBin - lowerBin + 1 > MAX_POSITION_BINS) {
    return { ok: false, reason: `${upperBin - lowerBin + 1} bins is wider than ${MAX_POSITION_BINS}` };
  }
  if (activeBin < lowerBin || activeBin > upperBin) {
    return { ok: false, reason: `active bin ${activeBin} left the range ${lowerBin}..${upperBin}` };
  }
  const left = args.nativeLamports - args.amountLamports;
  if (left < args.reserveLamports) {
    return { ok: false, reason: `the deposit would leave ${left} lamports, under the ${args.reserveLamports} reserve` };
  }
  return {
    ok: true,
    minDeltaId: lowerBin - activeBin,
    maxDeltaId: upperBin - activeBin,
    singleSided: args.singleSidedSol ? args.side : null,
  };
}

export type Balances = { readonly x: bigint; readonly y: bigint };

/**
 * What a close put in the wallet, per side. Only this may be swapped back to SOL: a shared wallet's other tokens are
 * not the office's to sell.
 */
export const received = (before: Balances, after: Balances): Balances => ({
  x: after.x > before.x ? after.x - before.x : 0n,
  y: after.y > before.y ? after.y - before.y : 0n,
});
