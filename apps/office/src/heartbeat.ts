import { judge, MIN_WRITE_MS, type ScheduleName, verdictText } from "@vexis/shared/heartbeat";
import { Clock, Effect, type Schedule } from "effect";
import { AppConfig } from "./config.ts";
import { Db } from "./services/db.ts";
import { Telegram } from "./services/telegram.ts";

/**
 * Runs `task` on a schedule and records a heartbeat per run: a finished tick, or the error it ended with. Failures
 * and defects are logged, never fatal. A finished tick is written at most every `MIN_WRITE_MS`, so the 3-second
 * inbox does not write each time.
 */
export const supervised = <E, R>(
  name: ScheduleName,
  task: Effect.Effect<void, E, R>,
  schedule: Schedule.Schedule<unknown>,
) => {
  let wrote = 0;
  return Effect.gen(function* () {
    const db = yield* Db;
    const failure = yield* task.pipe(
      Effect.as(null),
      Effect.catchCause((cause) => Effect.logError(`${name} failed`, cause).pipe(Effect.as(String(cause)))),
    );
    const now = yield* Clock.currentTimeMillis;
    if (failure === null && now - wrote < MIN_WRITE_MS) return;
    wrote = now;
    yield* db
      .heartbeat(name, new Date(now), failure)
      .pipe(Effect.catchCause((cause) => Effect.logError(`${name} heartbeat failed`, cause)));
  }).pipe(Effect.repeat(schedule));
};

/** Reports the runner's schedules to the admin, once per outage; the runner does the same for this runtime. */
export const watchdog = Effect.gen(function* () {
  const admin = (yield* AppConfig).admin;
  if (!admin) return;
  const db = yield* Db;
  const telegram = yield* Telegram;
  const now = yield* Clock.currentTimeMillis;
  for (const verdict of judge(yield* db.heartbeats(), "runner", now)) {
    const sent = yield* telegram.send(admin.botToken, admin.chatId, verdictText(verdict)).pipe(
      Effect.as(true),
      Effect.catchTag("TelegramError", (e) =>
        Effect.logWarning(`watchdog send failed: ${e.message}`).pipe(Effect.as(false)),
      ),
    );
    if (sent) yield* db.markAlerted(verdict.name, verdict.kind === "stale" ? new Date(now) : null);
  }
}).pipe(Effect.catchCause((cause) => Effect.logError("watchdog failed", cause)));
