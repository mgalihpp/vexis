import DLMM, {
  createProgram,
  DEFAULT_BIN_PER_POSITION,
  deriveBinArrayBitmapExtension,
  getBinArraysRequiredByPositionRange,
  getTokenProgramId,
  isOverflowDefaultBinArrayBitmap,
  POSITION_BIN_DATA_SIZE,
} from "@meteora-ag/dlmm";
import { getAccountLenForMint, getAssociatedTokenAddressSync, unpackMint } from "@solana/spl-token";
import { type Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import BN from "bn.js";

// What opening or moving a DLMM position costs beyond its deposit, read on chain. Every number is the chain's rent-exempt
// minimum for an account's real size and only counts accounts that do not exist yet; nothing here is a constant.

type Program = ReturnType<typeof createProgram>;

/**
 * A position account's size: the program's `PositionV2` from its IDL, plus per-bin data past the default width. The
 * SDK's `getPositionRentExemption` sizes it 8 bytes short of the IDL, so it is not used.
 */
const positionSize = (program: Program, bins: number) =>
  program.account.positionV2.size + Math.max(0, bins - DEFAULT_BIN_PER_POSITION.toNumber()) * POSITION_BIN_DATA_SIZE;

/** Rent a new position account of the default width takes, read on chain. It comes back when the position closes. */
export const positionRentSol = async (connection: Connection) =>
  (await connection.getMinimumBalanceForRentExemption(
    positionSize(createProgram(connection), DEFAULT_BIN_PER_POSITION.toNumber()),
  )) / LAMPORTS_PER_SOL;

export type OpenSetup = {
  /** Rent of the position account; returned at close. */
  readonly positionSol: number;
  /** Bin arrays the open creates, and their rent. The pool keeps it: it never comes back. */
  readonly binArrays: number;
  readonly binArraySol: number;
  /** The pool's bitmap extension, when the range is outside the default bitmap and it does not exist yet. */
  readonly bitmapSol: number;
  /** The owner's missing token accounts for the pair, sized for the mint (Token-2022 extensions included). */
  readonly tokenAccountSol: number;
  readonly totalSol: number;
};

export type RangeArrays = {
  /** Bin arrays the range still needs, and their rent. The pool keeps it: it never comes back. */
  readonly binArrays: number;
  readonly binArraySol: number;
  /** The pool's bitmap extension, when the range is outside the default bitmap and it does not exist yet. */
  readonly bitmapSol: number;
  readonly totalSol: number;
};

/**
 * The bin arrays and bitmap extension a liquidity range still needs. The arrays are the ones the zap path creates
 * (`getBinArraysRequiredByPositionRange`: each 70-bin chunk's array and the next one up, as `missingBinArrayTransaction`
 * in the runner builds), so the quote and the send count the same accounts.
 */
async function rangeArrays(connection: Connection, dlmm: DLMM, lowerBin: number, upperBin: number) {
  const programId = dlmm.program.programId;
  const arrays = getBinArraysRequiredByPositionRange(dlmm.pubkey, new BN(lowerBin), new BN(upperBin), programId);
  const [bitmap] = deriveBinArrayBitmapExtension(dlmm.pubkey, programId);
  const infos = await connection.getMultipleAccountsInfo([...arrays.map((a) => a.key), bitmap]);
  const missing = arrays.filter((_, i) => (infos[i] ?? null) === null).length;
  const needsBitmap =
    arrays.some((a) => isOverflowDefaultBinArrayBitmap(a.index)) && (infos[arrays.length] ?? null) === null;
  const rent = (size: number) => connection.getMinimumBalanceForRentExemption(size);
  const [binArray, bitmapRent] = await Promise.all([
    missing > 0 ? rent(dlmm.program.account.binArray.size) : 0,
    needsBitmap ? rent(dlmm.program.account.binArrayBitmapExtension.size) : 0,
  ]);
  const binArraySol = (binArray * missing) / LAMPORTS_PER_SOL;
  const bitmapSol = bitmapRent / LAMPORTS_PER_SOL;
  return { binArrays: missing, binArraySol, bitmapSol, totalSol: binArraySol + bitmapSol } satisfies RangeArrays;
}

/** What moving a position to `lowerBin..upperBin` creates: only bin arrays and the bitmap; the account stays. */
export async function quoteRangeArrays(
  connection: Connection,
  poolAddress: string,
  lowerBin: number,
  upperBin: number,
) {
  return rangeArrays(connection, await DLMM.create(connection, new PublicKey(poolAddress)), lowerBin, upperBin);
}

/** Quotes a new position over `lowerBin..upperBin`: its account, the range's bin arrays and bitmap, and token accounts. */
export async function quoteOpenSetup(
  connection: Connection,
  poolAddress: string,
  owner: string,
  lowerBin: number,
  upperBin: number,
): Promise<OpenSetup> {
  const dlmm = await DLMM.create(connection, new PublicKey(poolAddress));
  const { tokenXProgram, tokenYProgram } = getTokenProgramId(dlmm.lbPair);
  const mints = [
    { mint: dlmm.lbPair.tokenXMint, program: tokenXProgram },
    { mint: dlmm.lbPair.tokenYMint, program: tokenYProgram },
  ];
  const atas = mints.map((m) => getAssociatedTokenAddressSync(m.mint, new PublicKey(owner), true, m.program));
  const [arrays, infos] = await Promise.all([
    rangeArrays(connection, dlmm, lowerBin, upperBin),
    connection.getMultipleAccountsInfo([...atas, ...mints.map((m) => m.mint)]),
  ]);
  const ataSizes = mints.flatMap((m, i) => {
    if ((infos[i] ?? null) !== null) return [];
    const mintInfo = infos[2 + i] ?? null;
    if (mintInfo === null) throw new Error(`mint ${m.mint.toBase58()} not found`);
    return [getAccountLenForMint(unpackMint(m.mint, mintInfo, m.program))];
  });
  const rent = (size: number) => connection.getMinimumBalanceForRentExemption(size);
  const [position, ...ataRents] = await Promise.all([
    rent(positionSize(dlmm.program, upperBin - lowerBin + 1)),
    ...ataSizes.map(rent),
  ]);
  const positionSol = position / LAMPORTS_PER_SOL;
  const tokenAccountSol = ataRents.reduce((a, b) => a + b, 0) / LAMPORTS_PER_SOL;
  return {
    positionSol,
    binArrays: arrays.binArrays,
    binArraySol: arrays.binArraySol,
    bitmapSol: arrays.bitmapSol,
    tokenAccountSol,
    totalSol: positionSol + arrays.totalSol + tokenAccountSol,
  };
}
