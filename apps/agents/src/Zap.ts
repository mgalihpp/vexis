import { Connection, type Keypair } from "@solana/web3.js";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";
import { ZapError } from "./errors.ts";
import { DEFAULT_PRIORITY_LEVEL, type SendLog } from "./send.ts";
import { executeZapRebalance, type ZapRequest } from "./zap-execute.ts";

export type { ZapRequest };

/** Signs and sends a rebalance. The only service that moves funds; tests replace it with a fake. */
export class Zap extends Context.Service<
  Zap,
  {
    /** Remove -> swap -> zap-in for the position; succeeds with the last leg's signature once it confirmed. */
    rebalance(signer: Keypair, request: ZapRequest): Effect.Effect<string, ZapError>;
  }
>()("vexis/agents/Zap") {
  static readonly layer = Layer.effect(
    Zap,
    Effect.gen(function* () {
      // Priority fees come from Helius `getPriorityFeeEstimate`; another RPC sends with no priority fee.
      const rpc = yield* Config.String("SOLANA_RPC_URL").pipe(
        Config.withDefault("https://api.mainnet-beta.solana.com"),
      );
      const jupiterApiKey = yield* Config.Redacted("JUPITER_API_KEY").pipe(Config.option);
      const connection = new Connection(rpc, "confirmed");

      const rebalance = (signer: Keypair, request: ZapRequest) => {
        const prefix = `zap ${request.positionAddress}`;
        const log: SendLog = {
          info: (message) => Effect.runSync(Effect.logInfo(`${prefix}: ${message}`)),
          warn: (message) => Effect.runSync(Effect.logWarning(`${prefix}: ${message}`)),
        };
        return Effect.tryPromise({
          try: () =>
            executeZapRebalance(
              {
                connection,
                signer,
                log,
                priorityLevel: DEFAULT_PRIORITY_LEVEL,
                jupiterApiKey: Option.getOrUndefined(Option.map(jupiterApiKey, Redacted.value)),
              },
              request,
            ),
          catch: (cause) => new ZapError({ message: cause instanceof Error ? cause.message : String(cause) }),
        });
      };
      return Zap.of({ rebalance });
    }),
  );
}
