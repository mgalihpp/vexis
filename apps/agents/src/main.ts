import { BunRuntime } from "@effect/platform-bun";
import { Effect, Layer, Schedule } from "effect";
import { AppConfig } from "./AppConfig.ts";
import { cycle } from "./Cycle.ts";
import { Db } from "./Db.ts";
import { prune } from "./Ingest.ts";
import { Meteora } from "./Meteora.ts";
import { Telegram } from "./Telegram.ts";

/** Runs `task` now and then on a fixed schedule. Failures and defects are logged, never fatal. */
const supervised = <E, R>(name: string, task: Effect.Effect<void, E, R>, schedule: Schedule.Schedule<unknown>) =>
  task.pipe(
    Effect.catchCause((cause) => Effect.logError(`${name} failed`, cause)),
    Effect.repeat(schedule),
  );

const Runner = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Effect.logInfo("agents runner starting");
    yield* Effect.forkScoped(supervised("cycle", cycle(), Schedule.fixed("1 minute")));
    yield* Effect.forkScoped(supervised("prune", prune(), Schedule.spaced("1 hour")));
  }),
).pipe(Layer.provide(Layer.mergeAll(Db.layer, Meteora.layer, Telegram.layer, AppConfig.layer)));

BunRuntime.runMain(Layer.launch(Runner));
