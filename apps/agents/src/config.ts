import { walletPublicKeyOf } from "@vexis/db/secret";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

/** Settings that are not secrets or connections. */
export class AppConfig extends Context.Service<
  AppConfig,
  {
    /** Public origin of the web app, for the links in alerts. */
    readonly webUrl: string;
    /** The admin's own bot and chat for watchdog messages; null leaves the watchdog off. Never a user's bot. */
    readonly admin: { readonly botToken: string; readonly chatId: bigint } | null;
  }
>()("vexis/agents/AppConfig") {
  static readonly layer = Layer.effect(
    AppConfig,
    Effect.gen(function* () {
      const webUrl = yield* Config.String("VEXIS_WEB_URL").pipe(
        Config.orElse(() => Config.String("BETTER_AUTH_URL")),
        Config.withDefault("http://localhost:3000"),
      );
      // Required up front: a live agent opens its wallet's sealed secret with the private key (`Db.walletSigner`);
      // the public key, when set, must be its pair. WALLET_ENC_KEY is only for `v1` secrets not yet re-wrapped.
      const privateKey = yield* Config.Redacted("WALLET_PRIVATE_KEY");
      const publicKey = yield* Config.option(Config.Redacted("WALLET_PUBLIC_KEY"));
      const derived = yield* Effect.try({
        try: () => walletPublicKeyOf(Redacted.value(privateKey)),
        catch: (cause) => new Error(cause instanceof Error ? cause.message : "WALLET_PRIVATE_KEY is invalid"),
      }).pipe(Effect.orDie);
      if (Option.isSome(publicKey) && Redacted.value(publicKey.value) !== derived) {
        return yield* Effect.die(new Error("WALLET_PUBLIC_KEY is not the pair of WALLET_PRIVATE_KEY"));
      }
      for (const name of ["WALLET_ENC_KEY", "RPC_ENC_KEY", "LLM_ENC_KEY"]) {
        const key = yield* Config.option(Config.Redacted(name));
        if (Option.isSome(key) && Buffer.from(Redacted.value(key.value), "base64").length !== 32) {
          return yield* Effect.die(new Error(`${name} must be 32 bytes, base64 encoded`));
        }
      }
      const rpc = yield* Config.option(Config.Redacted("RPC_ENC_KEY"));
      const legacy = yield* Config.option(Config.Redacted("WALLET_ENC_KEY"));
      if (Option.isNone(rpc) && Option.isNone(legacy)) {
        return yield* Effect.die(new Error("RPC_ENC_KEY (or WALLET_ENC_KEY until it is set) is required"));
      }
      const botToken = yield* Config.option(Config.Redacted("ADMIN_TELEGRAM_BOT_TOKEN"));
      const chatId = yield* Config.option(Config.String("ADMIN_TELEGRAM_CHAT_ID"));
      const admin =
        Option.isSome(botToken) && Option.isSome(chatId) && /^-?\d+$/.test(chatId.value)
          ? { botToken: Redacted.value(botToken.value), chatId: BigInt(chatId.value) }
          : null;
      return AppConfig.of({ webUrl, admin });
    }),
  );
}
