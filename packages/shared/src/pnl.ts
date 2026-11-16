import { z } from "zod";

// Meteora's per-position PnL (`/positions/{pool}/pnl`), parsed the one way the portfolio and the office's Bookkeeper
// both read it, so a journal row and the portfolio show the same number for the same position.

/** Keeps a missing value as null, for the SOL fields Meteora drops for some pools. */
export const maybeNum = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null || v === "" ? null : Number(v)));
export const num = maybeNum.transform((v) => v ?? 0);

const Side = z.object({ sol: num, usd: num });
const Total = z.object({ total: Side });
const TokenAmount = z.object({ usd: num, amountSol: maybeNum });

const Unrealized = z.object({
  balances: num,
  balancesSol: maybeNum,
  unclaimedFeeTokenX: TokenAmount.nullish(),
  unclaimedFeeTokenY: TokenAmount.nullish(),
});

export const PositionPnl = z.object({
  positionAddress: z.string(),
  isClosed: z.boolean(),
  createdAt: z.number().nullish(),
  closedAt: z.number().nullish(),
  lowerBinId: z.number(),
  upperBinId: z.number(),
  minPrice: num,
  maxPrice: num,
  poolActiveBinId: z.number().nullish(),
  isOutOfRange: z.boolean().nullish(),
  allTimeDeposits: Total,
  allTimeWithdrawals: Total,
  allTimeFees: Total,
  pnlSol: maybeNum,
  pnlUsd: num,
  unrealizedPnl: Unrealized.nullish(),
});
export type PositionPnl = z.infer<typeof PositionPnl>;

export const PnlPage = z.object({
  hasNext: z.boolean(),
  positions: z.array(PositionPnl),
  tokenX: z.string().nullish(),
  tokenY: z.string().nullish(),
});

/** What went in, came out and was earned, and the PnL, in one currency. */
export function positionAmounts(p: PositionPnl, side: "sol" | "usd") {
  const deposit = p.allTimeDeposits.total[side];
  const withdraw = p.allTimeWithdrawals.total[side];
  const fees = p.allTimeFees.total[side];
  // Meteora drops pnlSol for some pools; it equals what came out plus fees minus what went in.
  return { deposit, withdraw, fees, pnl: side === "usd" ? p.pnlUsd : (p.pnlSol ?? withdraw + fees - deposit) };
}
