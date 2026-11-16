import { BunRuntime } from "@effect/platform-bun";
import { Effect, Layer, Schedule } from "effect";
import { AppConfig } from "./config.ts";
import { supervised, watchdog } from "./heartbeat/heartbeat.ts";
import { officeBookkeeper } from "./office/bookkeeper.ts";
import { officeExecutor } from "./office/executor.ts";
import { officeMonitor } from "./office/monitor.ts";
import { rebalanceCycle } from "./rebalance/rebalance.ts";
import { Chain } from "./services/chain.ts";
import { Db } from "./services/db.ts";
import { Meteora } from "./services/meteora.ts";
import { OfficeDb } from "./services/office-db.ts";
import { ScreenerHistory } from "./services/screener-history-store.ts";
import { Telegram } from "./services/telegram.ts";
import { WalletLock } from "./services/wallet-lock.ts";
import { Zap } from "./services/zap.ts";
import { cycle } from "./volume/cycle.ts";
import { prune } from "./volume/ingest.ts";
import { screenerCycle } from "./volume/screener.ts";

const Runner = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* Effect.logInfo("agents runner starting");
    yield* Effect.forkScoped(supervised("cycle", cycle(), Schedule.fixed("1 minute")));
    yield* Effect.forkScoped(supervised("screener", screenerCycle(), Schedule.fixed("1 minute")));
    yield* Effect.forkScoped(supervised("rebalance", rebalanceCycle(), Schedule.fixed("1 minute")));
    yield* Effect.forkScoped(supervised("office-executor", officeExecutor(), Schedule.fixed("1 minute")));
    yield* Effect.forkScoped(supervised("office-monitor", officeMonitor(), Schedule.fixed("1 minute")));
    yield* Effect.forkScoped(supervised("office-bookkeeper", officeBookkeeper(), Schedule.fixed("1 minute")));
    yield* Effect.forkScoped(watchdog("office").pipe(Effect.repeat(Schedule.fixed("1 minute"))));
    yield* Effect.forkScoped(supervised("prune", prune(), Schedule.spaced("1 hour")));
  }),
).pipe(
  Layer.provide(
    Layer.mergeAll(
      Db.layer,
      OfficeDb.layer,
      WalletLock.layer,
      Meteora.layer,
      ScreenerHistory.layer,
      Chain.layer,
      Zap.layer,
      Telegram.layer,
      AppConfig.layer,
    ),
  ),
);

BunRuntime.runMain(Layer.launch(Runner));
