import { BunRuntime } from "@effect/platform-bun";
import { Effect, Layer, Schedule } from "effect";
import { AppConfig } from "./config.ts";
import { Chain } from "./services/chain.ts";
import { Db } from "./services/db.ts";
import { Llm } from "./services/llm.ts";
import { Meteora, Screener } from "./services/meteora.ts";
import { OfficeState } from "./services/state.ts";
import { tick } from "./tick.ts";

/** Runs `task` now and then on a fixed schedule. Failures and defects are logged, never fatal. */
const supervised = <E, R>(name: string, task: Effect.Effect<void, E, R>, schedule: Schedule.Schedule<unknown>) =>
  task.pipe(
    Effect.catchCause((cause) => Effect.logError(`${name} failed`, cause)),
    Effect.repeat(schedule),
  );

const Office = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Effect.logInfo("office runtime starting (simulation only: nothing is signed or sent)");
    yield* Effect.forkScoped(supervised("tick", tick(), Schedule.fixed("1 minute")));
  }),
).pipe(
  Layer.provide(
    Layer.mergeAll(
      Db.layer,
      Screener.layer.pipe(Layer.provide(Meteora.layer)),
      Chain.layer,
      Llm.layer,
      OfficeState.layer,
      AppConfig.layer,
    ),
  ),
);

BunRuntime.runMain(Layer.launch(Office));
