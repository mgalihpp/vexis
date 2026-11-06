import { Config, Context, Effect, Layer, Redacted } from "effect";

/** Settings that are not secrets or connections. */
export class AppConfig extends Context.Service<
  AppConfig,
  {
    /** Public origin of the web app, for the links in alerts. */
    readonly webUrl: string;
  }
>()("vexis/agents/AppConfig") {
  static readonly layer = Layer.effect(
    AppConfig,
    Effect.gen(function* () {
      const webUrl = yield* Config.String("VEXIS_WEB_URL").pipe(
        Config.orElse(() => Config.String("BETTER_AUTH_URL")),
        Config.withDefault("http://localhost:3000"),
      );
      // Required up front: a live auto-rebalance agent decrypts its wallet with it (`Db.walletSigner`).
      const walletKey = yield* Config.Redacted("WALLET_ENC_KEY");
      if (Buffer.from(Redacted.value(walletKey), "base64").length !== 32) {
        return yield* Effect.die(new Error("WALLET_ENC_KEY must be 32 bytes, base64 encoded"));
      }
      return AppConfig.of({ webUrl });
    }),
  );
}
