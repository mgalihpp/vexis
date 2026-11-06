import DLMM from "@meteora-ag/dlmm";
import { Connection, PublicKey } from "@solana/web3.js";
import { Config, Context, Effect, Layer } from "effect";
import { ChainError } from "./errors.ts";
import type { OnChainPosition } from "./range.ts";

export type PoolState = {
  readonly activeBinId: number;
  readonly positions: ReadonlyArray<OnChainPosition>;
};

// Amounts arrive as decimal strings; only "is anything left" matters here.
const positive = (v: unknown) => /[1-9]/.test(String(v ?? "").split(".")[0] ?? "");

/** On-chain DLMM reads through the Meteora SDK. Reads only: nothing here signs or sends. */
export class Chain extends Context.Service<
  Chain,
  {
    /** The pool's active bin and the owner's positions in it. */
    pool(poolAddress: string, owner: string): Effect.Effect<PoolState, ChainError>;
  }
>()("vexis/agents/Chain") {
  static readonly layer = Layer.effect(
    Chain,
    Effect.gen(function* () {
      const rpc = yield* Config.String("SOLANA_RPC_URL").pipe(
        Config.withDefault("https://api.mainnet-beta.solana.com"),
      );
      const connection = new Connection(rpc, "confirmed");

      const pool = (poolAddress: string, owner: string) =>
        Effect.tryPromise({
          try: async (): Promise<PoolState> => {
            const dlmm = await DLMM.create(connection, new PublicKey(poolAddress));
            const { activeBin, userPositions } = await dlmm.getPositionsByUserAndLbPair(new PublicKey(owner));
            return {
              activeBinId: activeBin.binId,
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
              })),
            };
          },
          catch: (cause) => new ChainError({ poolAddress, cause }),
        }).pipe(
          Effect.timeoutOrElse({
            duration: "30 seconds",
            orElse: () => Effect.fail(new ChainError({ poolAddress, cause: new Error("timed out") })),
          }),
        );

      return Chain.of({ pool });
    }),
  );
}
