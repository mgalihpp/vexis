import DLMM from "@meteora-ag/dlmm";
import { Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  type OpenSetup,
  positionRentSol,
  quoteOpenSetup,
  quoteRangeArrays,
  type RangeArrays,
} from "@vexis/shared/open-cost";
import { Context, Effect, Layer } from "effect";
import { ChainError } from "../errors.ts";

export type PoolBins = { readonly activeBin: number; readonly binStep: number };

/** A user's RPC URL usually carries an API key; it never reaches a log line, a stored error or a prompt. */
export function redactRpc(text: string, url: string) {
  const query = URL.canParse(url) ? new URL(url).search.slice(1) : "";
  const scrubbed = text.replaceAll(url, "<rpc>");
  return query ? scrubbed.replaceAll(query, "<rpc-query>") : scrubbed;
}

/** On-chain reads over the RPC the user gave. Reads only: nothing in the office signs or sends. */
export class Chain extends Context.Service<
  Chain,
  {
    /** The pool's active bin and bin step, through the DLMM SDK. */
    pool(rpcUrl: string, poolAddress: string): Effect.Effect<PoolBins, ChainError>;
    /** The wallet's native SOL. */
    balanceSol(rpcUrl: string, owner: string): Effect.Effect<number, ChainError>;
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
>()("vexis/office/Chain") {
  static readonly layer = Layer.sync(Chain, () => {
    // Each user brings their own RPC, so one `Connection` per distinct URL.
    const byUrl = new Map<string, Connection>();
    const connection = (url: string) => {
      const found = byUrl.get(url) ?? new Connection(url, "confirmed");
      byUrl.set(url, found);
      return found;
    };
    const read = <A>(rpcUrl: string, what: string, f: (c: Connection) => Promise<A>) =>
      Effect.tryPromise({
        try: () => f(connection(rpcUrl)),
        catch: (cause) => new ChainError({ message: `${what}: ${redactRpc(String(cause), rpcUrl)}` }),
      }).pipe(
        Effect.timeoutOrElse({
          duration: "30 seconds",
          orElse: () => Effect.fail(new ChainError({ message: `${what}: timed out` })),
        }),
      );

    return Chain.of({
      pool: (rpcUrl, poolAddress) =>
        read(rpcUrl, `pool ${poolAddress}`, async (c) => {
          const dlmm = await DLMM.create(c, new PublicKey(poolAddress));
          const active = await dlmm.getActiveBin();
          return { activeBin: active.binId, binStep: dlmm.lbPair.binStep };
        }),
      positionRentSol: (rpcUrl) => read(rpcUrl, "position rent", positionRentSol),
      openSetup: (rpcUrl, poolAddress, owner, lowerBin, upperBin) =>
        read(rpcUrl, `setup cost ${poolAddress}`, (c) => quoteOpenSetup(c, poolAddress, owner, lowerBin, upperBin)),
      rangeArrays: (rpcUrl, poolAddress, lowerBin, upperBin) =>
        read(rpcUrl, `bin arrays ${poolAddress}`, (c) => quoteRangeArrays(c, poolAddress, lowerBin, upperBin)),
      balanceSol: (rpcUrl, owner) =>
        read(rpcUrl, "balance", async (c) => (await c.getBalance(new PublicKey(owner))) / LAMPORTS_PER_SOL),
    });
  });
}
