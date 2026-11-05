import { Config, Context, Effect, Layer } from "effect";

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
      return AppConfig.of({ webUrl });
    }),
  );
}
