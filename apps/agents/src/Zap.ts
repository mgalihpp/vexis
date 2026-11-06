import type { Keypair } from "@solana/web3.js";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";
import { ZapError } from "./errors.ts";
import {
  type ClaimRequest,
  type CompoundRequest,
  executeClaimFees,
  executeCompoundTopUp,
  executeSweepToSol,
  type SweepRequest,
} from "./fee-execute.ts";
import { connections, redactRpc } from "./rpc.ts";
import { DEFAULT_PRIORITY_LEVEL, type SendLog } from "./send.ts";
import { executeZapRebalance, type ZapContext, type ZapRequest } from "./zap-execute.ts";

export type { ClaimRequest, CompoundRequest, SweepRequest, ZapRequest };

/**
 * Signs and sends with the agent wallet, over the RPC the user gave. The only service that moves funds; tests replace
 * it with a fake. Every call resolves to its last confirmed signature; the fee steps resolve to null when there was
 * nothing to do.
 */
export class Zap extends Context.Service<
  Zap,
  {
    /** Remove -> swap -> zap-in for the position. */
    rebalance(rpcUrl: string, signer: Keypair, request: ZapRequest): Effect.Effect<string, ZapError>;
    /** Claims the position's fees to the wallet, leaving its range alone. */
    claimFees(rpcUrl: string, signer: Keypair, request: ClaimRequest): Effect.Effect<string | null, ZapError>;
    /** Deposits claimed fees back into the position. */
    compound(rpcUrl: string, signer: Keypair, request: CompoundRequest): Effect.Effect<string | null, ZapError>;
    /** Swaps claimed fees to SOL. */
    sweep(rpcUrl: string, signer: Keypair, request: SweepRequest): Effect.Effect<string | null, ZapError>;
  }
>()("vexis/agents/Zap") {
  static readonly layer = Layer.effect(
    Zap,
    Effect.gen(function* () {
      const jupiterApiKey = Option.getOrUndefined(
        Option.map(yield* Config.Redacted("JUPITER_API_KEY").pipe(Config.option), Redacted.value),
      );
      const connectionFor = connections();

      const run =
        <R, A>(name: string, execute: (ctx: ZapContext, request: R) => Promise<A>, subject: (request: R) => string) =>
        (rpcUrl: string, signer: Keypair, request: R) => {
          const prefix = `${name} ${subject(request)}`;
          // Priority fees come from Helius `getPriorityFeeEstimate`; another RPC sends with no priority fee.
          const log: SendLog = {
            info: (message) => Effect.runSync(Effect.logInfo(`${prefix}: ${redactRpc(message, rpcUrl)}`)),
            warn: (message) => Effect.runSync(Effect.logWarning(`${prefix}: ${redactRpc(message, rpcUrl)}`)),
          };
          const ctx: ZapContext = {
            connection: connectionFor(rpcUrl),
            signer,
            log,
            priorityLevel: DEFAULT_PRIORITY_LEVEL,
            jupiterApiKey,
          };
          return Effect.tryPromise({
            try: () => execute(ctx, request),
            catch: (cause) =>
              new ZapError({ message: redactRpc(cause instanceof Error ? cause.message : String(cause), rpcUrl) }),
          });
        };

      return Zap.of({
        rebalance: run("zap", executeZapRebalance, (r) => r.positionAddress),
        claimFees: run("claim", executeClaimFees, (r) => r.positionAddress),
        compound: run("compound", executeCompoundTopUp, (r) => r.positionAddress),
        sweep: run("sweep", executeSweepToSol, (r) => r.poolAddress),
      });
    }),
  );
}
