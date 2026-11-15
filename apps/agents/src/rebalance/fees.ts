// Fee math for auto-rebalance, ported from auto-rebalance-dlmm-bot `src/rebalance/reaccumulate.ts` and
// `src/rebalance/zap.ts`. Raw token units as bigint end to end; nothing here reads the chain.

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

const LAMPORTS_PER_SOL = 1_000_000_000;

const floor0 = (v: bigint) => (v < 0n ? 0n : v);
const min = (a: bigint, b: bigint) => (a < b ? a : b);

export const solToLamports = (sol: number) => BigInt(Math.round(sol * LAMPORTS_PER_SOL));
export const lamportsToSol = (lamports: bigint) => Number(lamports) / LAMPORTS_PER_SOL;

/** A non-negative decimal string, as the DLMM SDK prints a price (`0.000123`, `1.5e-9`), as num / den. */
export function decimalRatio(value: string): { num: bigint; den: bigint } | null {
  const m = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value.trim());
  if (!m) return null;
  const fraction = m[2] ?? "";
  const exponent = Number(m[3] ?? 0) - fraction.length;
  const digits = BigInt(`${m[1]}${fraction}`);
  return exponent >= 0
    ? { num: digits * 10n ** BigInt(exponent), den: 1n }
    : { num: digits, den: 10n ** BigInt(-exponent) };
}

/**
 * Unclaimed fees valued in SOL lamports at the active bin price (Y lamports per X lamport). Null when neither side is
 * SOL: there is no price to SOL.
 */
export function feeValueInLamports(args: {
  readonly feeX: bigint;
  readonly feeY: bigint;
  readonly mintX: string;
  readonly mintY: string;
  readonly pricePerLamport: string;
}): bigint | null {
  const feeX = floor0(args.feeX);
  const feeY = floor0(args.feeY);
  const price = decimalRatio(args.pricePerLamport) ?? { num: 0n, den: 1n };
  if (args.mintY === WSOL_MINT) return feeY + (feeX * price.num) / price.den;
  if (args.mintX === WSOL_MINT) return feeX + (price.num === 0n ? 0n : (feeY * price.den) / price.num);
  return null;
}

/** Each side deposits at most the claimed fee and at most what the wallet can spend. Null: nothing to deposit. */
export function compoundTopUpAmounts(
  feeX: bigint,
  feeY: bigint,
  balX: bigint,
  balY: bigint,
): { readonly x: bigint; readonly y: bigint } | null {
  const x = min(floor0(feeX), floor0(balX));
  const y = min(floor0(feeY), floor0(balY));
  return x === 0n && y === 0n ? null : { x, y };
}

/**
 * What a compound may spend from one side. DLMM's add-liquidity wraps the SOL side from native lamports itself, so
 * that side spends native SOL, less the reserve the agent keeps for fees and rent.
 */
export function compoundSpendableBalance(
  mint: string,
  ataBalance: bigint,
  nativeLamports: bigint,
  reserveLamports: bigint,
): bigint {
  return mint === WSOL_MINT ? floor0(nativeLamports - reserveLamports) : ataBalance;
}

export type SweepLeg = { readonly mint: string; readonly amount: bigint; readonly kind: "swap" | "unwrap" };

/**
 * Legs that turn claimed fees into SOL, unwraps first: every swap leg ends by closing the wSOL account. Each leg is
 * capped by the claimed fee so principal is never touched; both wSOL sides share one account, so they merge.
 */
export function planSweepLegs(args: {
  readonly feeX: bigint;
  readonly feeY: bigint;
  readonly balX: bigint;
  readonly balY: bigint;
  readonly mintX: string;
  readonly mintY: string;
}): SweepLeg[] | null {
  const legs: SweepLeg[] = [
    { mint: args.mintX, amount: min(floor0(args.feeX), floor0(args.balX)) },
    { mint: args.mintY, amount: min(floor0(args.feeY), floor0(args.balY)) },
  ]
    .filter((leg) => leg.amount > 0n)
    .map((leg): SweepLeg => ({ ...leg, kind: leg.mint === WSOL_MINT ? "unwrap" : "swap" }));
  if (legs.length === 0) return null;
  const unwraps = legs.filter((leg) => leg.kind === "unwrap");
  const swaps = legs.filter((leg) => leg.kind === "swap");
  if (unwraps.length < 2) return [...unwraps, ...swaps];
  return [{ mint: WSOL_MINT, amount: unwraps.reduce((sum, leg) => sum + leg.amount, 0n), kind: "unwrap" }, ...swaps];
}
