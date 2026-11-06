import { type AgentConfig, parseAgentConfig } from "@vexis/db/agents";
import { Array as Arr, Clock, Effect, Option } from "effect";
import { AppConfig } from "./AppConfig.ts";
import { Db, TELEGRAM_NOT_LINKED, TELEGRAM_RELINK, type Watch } from "./Db.ts";
import { BadAgentConfig } from "./errors.ts";
import { formatMessage, linkButtons, type SpikeLine } from "./format.ts";
import type { PoolReading } from "./Meteora.ts";
import { evaluateSpike, type Spike } from "./spike.ts";
import { Telegram } from "./Telegram.ts";

type Config = AgentConfig<"volume-watch">;
type Candidate = { readonly watch: Watch; readonly config: Config };
type Hit = Candidate & { readonly spike: Spike };

const parseWatch = (watch: Watch) =>
  Effect.try({
    try: (): Candidate => ({ watch, config: parseAgentConfig("volume-watch", watch.config) }),
    catch: (cause) => new BadAgentConfig({ agentId: watch.agentId, cause }),
  });

/** Rows to load per pool: enough for `baseline` valid readings even when about half are unknown. */
const windowFor = (config: Config) => config.baseline * 2 + 1;

/**
 * Judges every (agent, pool) pair against the shared `pool_minutes` rows, then alerts each agent
 * once with all of its spiking pools. `pools` are this cycle's readings; a pool that did not
 * arrive is skipped.
 */
export const evaluate = Effect.fn("evaluate")(function* (
  watches: ReadonlyArray<Watch>,
  pools: ReadonlyMap<string, PoolReading>,
) {
  const db = yield* Db;
  const now = yield* Clock.currentTimeMillis;

  const candidates = (yield* Effect.forEach(watches, (watch) =>
    parseWatch(watch).pipe(
      Effect.map(Option.some),
      Effect.catchTag("BadAgentConfig", (error) =>
        Effect.logWarning(`skipping agent ${error.agentId}: bad config`, error.cause).pipe(Effect.as(Option.none())),
      ),
    ),
  )).flatMap(Option.toArray);

  const live = candidates.filter((c) => pools.has(c.watch.poolAddress));
  const windowByPool = new Map<string, number>();
  for (const { watch, config } of live) {
    windowByPool.set(watch.poolAddress, Math.max(windowByPool.get(watch.poolAddress) ?? 0, windowFor(config)));
  }
  const minutesByPool = new Map(
    yield* Effect.forEach([...windowByPool], ([pool, limit]) =>
      db.recentMinutes(pool, limit).pipe(Effect.map((rows) => [pool, rows] as const)),
    ),
  );

  const hits = live.flatMap((candidate): Hit[] => {
    const spike = evaluateSpike(minutesByPool.get(candidate.watch.poolAddress) ?? [], candidate.config, now);
    return spike ? [{ ...candidate, spike }] : [];
  });

  const byAgent = Arr.groupBy(hits, (hit) => hit.watch.agentId);
  yield* Effect.forEach(
    Object.values(byAgent),
    (agentHits) =>
      notifyAgent(agentHits, pools).pipe(
        Effect.catchTag("DbError", (error) =>
          Effect.logError(`alert for agent ${agentHits[0].watch.agentId} failed: ${error.operation}`, error.cause),
        ),
      ),
    { discard: true },
  );
});

/**
 * One message for the agent's spiking pools. Order matters: take the cooldown slots, write the
 * alerts as undelivered, send, then settle. A failed send hands the slots back, so the next
 * minute can try again.
 */
const notifyAgent = Effect.fn("notifyAgent")(function* (
  hits: readonly [Hit, ...Hit[]],
  pools: ReadonlyMap<string, PoolReading>,
) {
  const db = yield* Db;
  const telegram = yield* Telegram;
  const { webUrl } = yield* AppConfig;
  const { agentId, userId } = hits[0].watch;

  const target = yield* db.telegramTarget(userId, "volume-watch");
  if (target._tag === "missing") {
    yield* db.pauseAgent(agentId, TELEGRAM_NOT_LINKED);
    yield* Effect.logInfo(`agent ${agentId} paused: ${userId} has not linked a Telegram bot`);
    return;
  }
  if (target._tag === "unreadable") {
    yield* db.pauseAgent(agentId, TELEGRAM_RELINK);
    yield* Effect.logWarning(`agent ${agentId} paused: ${userId}'s bot token does not decrypt with TOKEN_ENC_KEY`);
    return;
  }
  const { chatId, botToken } = target;

  const at = new Date(yield* Clock.currentTimeMillis);
  const claimed = (yield* Effect.forEach(hits, (hit) =>
    db
      .claimCooldown(hit.watch.agentPoolId, hit.config.cooldownSec * 1000, at)
      .pipe(Effect.map(Option.map((slot) => ({ hit, previous: slot.previous })))),
  )).flatMap(Option.toArray);
  if (!Arr.isArrayNonEmpty(claimed)) return;

  const release = Effect.forEach(
    claimed,
    ({ hit, previous }) => db.releaseCooldown(hit.watch.agentPoolId, at, previous),
    { discard: true },
  );

  const ids = yield* db
    .recordAlerts(
      claimed.map(({ hit }) => ({
        agentId,
        userId,
        poolAddress: hit.watch.poolAddress,
        vol1m: hit.spike.vol1m,
        baseline: hit.spike.baseline,
        ratio: hit.spike.ratio,
        at,
      })),
    )
    .pipe(Effect.tapError(() => release.pipe(Effect.ignore)));

  const lines = claimed.map(({ hit }): SpikeLine => {
    const reading = pools.get(hit.watch.poolAddress);
    return {
      name: reading?.name ?? hit.watch.label ?? hit.watch.poolAddress,
      binStep: reading?.binStep,
      poolAddress: hit.watch.poolAddress,
      baselineMin: hit.config.baseline,
      spike: hit.spike,
    };
  });

  yield* telegram.send(chatId, formatMessage(lines), botToken, linkButtons(lines, webUrl)).pipe(
    Effect.matchEffect({
      onSuccess: () => db.markDelivered(ids),
      onFailure: (error) =>
        Effect.logWarning(`telegram send failed for agent ${agentId}`, error.cause).pipe(
          Effect.andThen(db.markFailed(ids, String(error.cause))),
          Effect.andThen(release),
        ),
    }),
  );
});
