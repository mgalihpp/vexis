import { judge, type Runtime, type ScheduleName, verdictText } from "@vexis/db/heartbeat";
import { Clock, Effect, type Schedule } from "effect";
import { AppConfig } from "../config.ts";
import { Db } from "../services/db.ts";
import { Telegram } from "../services/telegram.ts";

/** One run of a schedule's task, then its heartbeat: a finished tick, or the error it ended with. Never fails. */
export const tracked = <E, R>(name: ScheduleName, task: Effect.Effect<void, E, R>) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const outcome = yield* task.pipe(
      Effect.as(null),
      Effect.catchCause((cause) => Effect.logError(`${name} failed`, cause).pipe(Effect.as(String(cause)))),
    );
    const at = new Date(yield* Clock.currentTimeMillis);
    yield* db
      .heartbeat(name, at, outcome)
      .pipe(Effect.catchCause((cause) => Effect.logError(`${name} heartbeat failed`, cause)));
  });

/** Runs `task` now and then on a fixed schedule, with a heartbeat per run. Failures and defects are never fatal. */
export const supervised = <E, R>(
  name: ScheduleName,
  task: Effect.Effect<void, E, R>,
  schedule: Schedule.Schedule<unknown>,
) => tracked(name, task).pipe(Effect.repeat(schedule));

/**
 * Sends the admin one message per outage of `runtime`'s schedules and one when they tick again. It watches the
 * other runtime's schedules, so a dead runner is reported by the office runtime and the other way round.
 * An alert is open (`alerted_at`) only after its message went out, so a failed send is retried next minute.
 */
export const watchdog = (runtime: Runtime) =>
  Effect.gen(function* () {
    const admin = (yield* AppConfig).admin;
    if (!admin) return;
    const db = yield* Db;
    const telegram = yield* Telegram;
    const now = yield* Clock.currentTimeMillis;
    for (const verdict of judge(yield* db.heartbeats(), runtime, now)) {
      const sent = yield* telegram.send(admin.chatId, verdictText(verdict), admin.botToken).pipe(
        Effect.as(true),
        Effect.catchTag("TelegramError", (e) =>
          Effect.logWarning(`watchdog send failed: ${e.message}`).pipe(Effect.as(false)),
        ),
      );
      if (sent) yield* db.markAlerted(verdict.name, verdict.kind === "stale" ? new Date(now) : null);
    }
  }).pipe(Effect.catchCause((cause) => Effect.logError("watchdog failed", cause)));
