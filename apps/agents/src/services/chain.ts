import DLMM from "@meteora-ag/dlmm";
import { type Connection, PublicKey } from "@solana/web3.js";
import {
  type OpenSetup,
  positionRentSol,
  quoteOpenSetup,
  quoteRangeArrays,
  type RangeArrays,
} from "@vexis/shared/open-cost";
import { Context, Effect, Layer } from "effect";
import { ChainError } from "../errors.ts";
import type { OnChainPosition } from "../rebalance/range.ts";
import { connections, redactRpc } from "../rebalance/rpc.ts";

/** A position with its liquidity and unclaimed fees, in raw token units. */
export type ChainPosition = OnChainPosition & {
  readonly amountX: bigint;
  readonly amountY: bigint;
  readonly feeX: bigint;
  readonly feeY: bigint;
};

export type PoolState = {
  readonly activeBinId: number;
  /** Price of the active bin in Y lamports per X lamport, as the SDK prints it. */
  readonly pricePerLamport: string;
  readonly mintX: string;
  readonly mintY: string;
  readonly positions: ReadonlyArray<ChainPosition>;
  /** The owner's native SOL, which pays every transaction and rent. */
  readonly nativeLamports: bigint;
};

// Amounts arrive as decimal strings of raw units; the fraction is below one raw unit.
const whole = (v: unknown) => String(v ?? "").split(".")[0] ?? "";
const positive = (v: unknown) => /[1-9]/.test(whole(v));
const raw = (v: unknown) => (/^\d+$/.test(whole(v)) ? BigInt(whole(v)) : 0n);

/** On-chain DLMM reads through the Meteora SDK, over the RPC the user gave. Reads only: nothing here signs or sends. */
export class Chain extends Context.Service<
  Chain,
  {
    /** The pool's active bin and mints, the owner's positions in it and the owner's SOL balance. */
    pool(rpcUrl: string, poolAddress: string, owner: string): Effect.Effect<PoolState, ChainError>;
    /** Rent of a new position account, read on chain. */
    positionRentSol(rpcUrl: string): Effect.Effect<number, ChainError>;
    /** What an open over these bins costs beyond its deposit, read on chain (`quoteOpenSetup`). */
    openSetup(
      rpcUrl: string,
      poolAddress: string,
      owner: string,
      lowerBin: number,
      upperBin: number,
    ): Effect.Effect<OpenSetup, ChainError>;
    /** Rent the bin arrays and bitmap a position moved to these bins still needs, read on chain. */
    rangeArrays(
      rpcUrl: string,
      poolAddress: string,
      lowerBin: number,
      upperBin: number,
    ): Effect.Effect<RangeArrays, ChainError>;
  }
>()("vexis/agents/Chain") {
  static readonly layer = Layer.sync(Chain, () => {
    const connectionFor = connections();

    const pool = (rpcUrl: string, poolAddress: string, owner: string) =>
      Effect.tryPromise({
        try: async (): Promise<PoolState> => {
          const connection = connectionFor(rpcUrl);
          const ownerKey = new PublicKey(owner);
          const dlmm = await DLMM.create(connection, new PublicKey(poolAddress));
          const [{ activeBin, userPositions }, lamports] = await Promise.all([
            dlmm.getPositionsByUserAndLbPair(ownerKey),
            connection.getBalance(ownerKey),
          ]);
          return {
            activeBinId: activeBin.binId,
            pricePerLamport: activeBin.price,
            mintX: dlmm.lbPair.tokenXMint.toBase58(),
            mintY: dlmm.lbPair.tokenYMint.toBase58(),
            nativeLamports: BigInt(lamports),
            positions: userPositions.map((p) => ({
              address: p.publicKey.toBase58(),
              lowerBinId: p.positionData.lowerBinId,
              upperBinId: p.positionData.upperBinId,
              funded: [
                p.positionData.totalXAmount,
                p.positionData.totalYAmount,
                p.positionData.feeX,
                p.positionData.feeY,
              ].some(positive),
              amountX: raw(p.positionData.totalXAmount),
              amountY: raw(p.positionData.totalYAmount),
              feeX: BigInt(p.positionData.feeX.toString()),
              feeY: BigInt(p.positionData.feeY.toString()),
            })),
          };
        },
        catch: (cause) => new ChainError({ poolAddress, cause: new Error(redactRpc(String(cause), rpcUrl)) }),
      }).pipe(
        Effect.timeoutOrElse({
          duration: "30 seconds",
          orElse: () => Effect.fail(new ChainError({ poolAddress, cause: new Error("timed out") })),
        }),
      );

    const read = <A>(rpcUrl: string, poolAddress: string, f: (c: Connection) => Promise<A>) =>
      Effect.tryPromise({
        try: () => f(connectionFor(rpcUrl)),
        catch: (cause) => new ChainError({ poolAddress, cause: new Error(redactRpc(String(cause), rpcUrl)) }),
      }).pipe(
        Effect.timeoutOrElse({
          duration: "30 seconds",
          orElse: () => Effect.fail(new ChainError({ poolAddress, cause: new Error("timed out") })),
        }),
      );

    return Chain.of({
      pool,
      positionRentSol: (rpcUrl) => read(rpcUrl, "-", positionRentSol),
      openSetup: (rpcUrl, poolAddress, owner, lowerBin, upperBin) =>
        read(rpcUrl, poolAddress, (c) => quoteOpenSetup(c, poolAddress, owner, lowerBin, upperBin)),
      rangeArrays: (rpcUrl, poolAddress, lowerBin, upperBin) =>
        read(rpcUrl, poolAddress, (c) => quoteRangeArrays(c, poolAddress, lowerBin, upperBin)),
    });
  });
}
