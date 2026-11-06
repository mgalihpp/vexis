import DLMM from "@meteora-ag/dlmm";
import { PublicKey } from "@solana/web3.js";
import { Context, Effect, Layer } from "effect";
import { ChainError } from "./errors.ts";
import type { OnChainPosition } from "./range.ts";
import { connections, redactRpc } from "./rpc.ts";

/** A position with its unclaimed fees, in raw token units. */
export type ChainPosition = OnChainPosition & { readonly feeX: bigint; readonly feeY: bigint };

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

// Amounts arrive as decimal strings; only "is anything left" matters here.
const positive = (v: unknown) => /[1-9]/.test(String(v ?? "").split(".")[0] ?? "");

/** On-chain DLMM reads through the Meteora SDK, over the RPC the user gave. Reads only: nothing here signs or sends. */
export class Chain extends Context.Service<
  Chain,
  {
    /** The pool's active bin and mints, the owner's positions in it and the owner's SOL balance. */
    pool(rpcUrl: string, poolAddress: string, owner: string): Effect.Effect<PoolState, ChainError>;
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

    return Chain.of({ pool });
  });
}
