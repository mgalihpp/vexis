import { BunRuntime } from "@effect/platform-bun";
import { Effect, Layer, Schedule } from "effect";
import { AppConfig } from "./config.ts";
import { supervised, watchdog } from "./heartbeat.ts";
import { pollInbox } from "./inbox.ts";
import { Chain } from "./services/chain.ts";
import { Db } from "./services/db.ts";
import { Llm } from "./services/llm.ts";
import { Meteora, Screener } from "./services/meteora.ts";
import { OfficeState } from "./services/state.ts";
import { Telegram } from "./services/telegram.ts";
import { tick } from "./tick.ts";

const Office = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Effect.logInfo("office runtime starting (simulation only: nothing is signed or sent)");
    yield* Effect.forkScoped(supervised("office-tick", tick(), Schedule.fixed("1 minute")));
    // Its own fast schedule, so a button press lands in seconds rather than at the next tick.
    yield* Effect.forkScoped(watchdog.pipe(Effect.repeat(Schedule.fixed("1 minute"))));
    yield* Effect.forkScoped(supervised("office-inbox", pollInbox(), Schedule.spaced("3 seconds")));
  }),
).pipe(
  Layer.provide(
    Layer.mergeAll(
      Db.layer,
      Screener.layer.pipe(Layer.provide(Meteora.layer)),
      Chain.layer,
      Llm.layer,
      OfficeState.layer,
      Telegram.layer,
      AppConfig.layer,
    ),
  ),
);

BunRuntime.runMain(Layer.launch(Office));
