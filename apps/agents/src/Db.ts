import { TELEGRAM_NOT_LINKED } from "@vexis/db/agents";
import { closeDb, createDb } from "@vexis/db/client";
import { agentAlerts, agentPools, agents, poolMinutes, telegramLinks } from "@vexis/db/schema";
import { decryptSecret } from "@vexis/db/secret";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";
import { DbError } from "./errors.ts";

/** One (agent, pool) pair of a runnable volume-watch agent. `config` is raw jsonb. */
export type Watch = {
  readonly agentId: string;
  readonly userId: string;
  readonly agentPoolId: string;
  readonly poolAddress: string;
  readonly label: string | null;
  readonly config: unknown;
  readonly lastAlertAt: Date | null;
};

export type StoredReading = { readonly minute: number; readonly cumulativeVolume: number };

export type NewMinute = {
  readonly poolAddress: string;
  readonly minute: Date;
  readonly cumulativeVolume: number;
  readonly volume: number | null;
  readonly tvl: number | null;
};

export type NewAlert = {
  readonly agentId: string;
  readonly userId: string;
  readonly poolAddress: string;
  readonly vol1m: number;
  readonly baseline: number;
  readonly ratio: number;
  readonly at: Date;
};

export { TELEGRAM_NOT_LINKED };

/** Postgres `double precision` takes Infinity but JSON does not; a zero baseline is stored capped. */
const MAX_STORED_RATIO = 1_000_000;

/** Everything the runner reads or writes in Postgres, as domain operations. */
export class Db extends Context.Service<
  Db,
  {
    /** Enabled, unpaused volume-watch agents joined with their pools. */
    runnableWatches(): Effect.Effect<ReadonlyArray<Watch>, DbError>;
    /** Newest stored reading per pool, for the next delta. Pools never seen are absent. */
    latestReadings(pools: ReadonlyArray<string>): Effect.Effect<ReadonlyMap<string, StoredReading>, DbError>;
    /** Existing `(pool, minute)` rows are kept. */
    insertMinutes(rows: ReadonlyArray<NewMinute>): Effect.Effect<void, DbError>;
    pruneMinutes(before: Date): Effect.Effect<void, DbError>;
    /** Newest `limit` rows of a pool, ascending by minute. */
    recentMinutes(
      pool: string,
      limit: number,
    ): Effect.Effect<ReadonlyArray<{ readonly minute: number; readonly volume: number | null }>, DbError>;
    /** Where the user's alerts go: their chat and their own bot's token (decrypted). None until both are linked. */
    telegramTarget(
      userId: string,
    ): Effect.Effect<Option.Option<{ readonly chatId: bigint; readonly botToken: string }>, DbError>;
    pauseAgent(agentId: string, reason: string): Effect.Effect<void, DbError>;
    /**
     * In one transaction: reads `last_alert_at` under a row lock and, unless it is inside the
     * cooldown, sets it to `now`. Some(previous) means the slot is yours; None means cooling down.
     */
    claimCooldown(
      agentPoolId: string,
      cooldownMs: number,
      now: Date,
    ): Effect.Effect<Option.Option<{ readonly previous: Date | null }>, DbError>;
    /** Gives the slot back after a failed delivery, unless a later claim replaced it. */
    releaseCooldown(agentPoolId: string, claimedAt: Date, previous: Date | null): Effect.Effect<void, DbError>;
    /** Inserts with `delivered = false` and returns the new ids in input order. */
    recordAlerts(alerts: ReadonlyArray<NewAlert>): Effect.Effect<ReadonlyArray<string>, DbError>;
    markDelivered(ids: ReadonlyArray<string>): Effect.Effect<void, DbError>;
    markFailed(ids: ReadonlyArray<string>, error: string): Effect.Effect<void, DbError>;
  }
>()("vexis/agents/Db") {
  static readonly layer = Layer.effect(
    Db,
    Effect.gen(function* () {
      const url = yield* Config.Redacted("DATABASE_URL");
      const db = yield* Effect.acquireRelease(
        Effect.sync(() => createDb(Redacted.value(url), { max: 3 })),
        (client) => Effect.promise(() => closeDb(client)),
      );

      const run = <A>(operation: string, f: () => Promise<A>) =>
        Effect.tryPromise({ try: f, catch: (cause) => new DbError({ operation, cause }) });

      return Db.of({
        runnableWatches: () =>
          run("runnableWatches", () =>
            db
              .select({
                agentId: agents.id,
                userId: agents.userId,
                agentPoolId: agentPools.id,
                poolAddress: agentPools.poolAddress,
                label: agentPools.label,
                config: agents.config,
                lastAlertAt: agentPools.lastAlertAt,
              })
              .from(agents)
              .innerJoin(agentPools, and(eq(agentPools.agentId, agents.id), eq(agentPools.userId, agents.userId)))
              .where(and(eq(agents.kind, "volume-watch"), eq(agents.enabled, true), eq(agents.paused, false))),
          ),

        latestReadings: (pools) =>
          pools.length === 0
            ? Effect.succeed(new Map())
            : run("latestReadings", () =>
                db
                  .selectDistinctOn([poolMinutes.poolAddress], {
                    poolAddress: poolMinutes.poolAddress,
                    minute: poolMinutes.minute,
                    cumulativeVolume: poolMinutes.cumulativeVolume,
                  })
                  .from(poolMinutes)
                  .where(inArray(poolMinutes.poolAddress, [...pools]))
                  .orderBy(poolMinutes.poolAddress, desc(poolMinutes.minute)),
              ).pipe(
                Effect.map(
                  (rows) =>
                    new Map(
                      rows.map((r) => [
                        r.poolAddress,
                        { minute: r.minute.getTime(), cumulativeVolume: r.cumulativeVolume },
                      ]),
                    ),
                ),
              ),

        insertMinutes: (rows) =>
          rows.length === 0
            ? Effect.void
            : run("insertMinutes", () =>
                db
                  .insert(poolMinutes)
                  .values([...rows])
                  .onConflictDoNothing(),
              ).pipe(Effect.asVoid),

        pruneMinutes: (before) =>
          run("pruneMinutes", () => db.delete(poolMinutes).where(lt(poolMinutes.minute, before))).pipe(Effect.asVoid),

        recentMinutes: (pool, limit) =>
          run("recentMinutes", () =>
            db
              .select({ minute: poolMinutes.minute, volume: poolMinutes.volume })
              .from(poolMinutes)
              .where(eq(poolMinutes.poolAddress, pool))
              .orderBy(desc(poolMinutes.minute))
              .limit(limit),
          ).pipe(Effect.map((rows) => rows.map((r) => ({ minute: r.minute.getTime(), volume: r.volume })).reverse())),

        telegramTarget: (userId) =>
          run("telegramTarget", async () => {
            const [row] = await db
              .select({ chatId: telegramLinks.chatId, botToken: telegramLinks.botToken })
              .from(telegramLinks)
              .where(eq(telegramLinks.userId, userId));
            return row?.chatId != null && row.botToken
              ? { chatId: row.chatId, botToken: decryptSecret(row.botToken) }
              : undefined;
          }).pipe(Effect.map(Option.fromNullishOr)),

        pauseAgent: (agentId, reason) =>
          run("pauseAgent", () =>
            db.update(agents).set({ paused: true, pausedReason: reason }).where(eq(agents.id, agentId)),
          ).pipe(Effect.asVoid),

        claimCooldown: (agentPoolId, cooldownMs, now) =>
          run("claimCooldown", () =>
            db.transaction(async (tx) => {
              const [row] = await tx
                .select({ lastAlertAt: agentPools.lastAlertAt })
                .from(agentPools)
                .where(eq(agentPools.id, agentPoolId))
                .for("update");
              if (!row) return undefined;
              if (row.lastAlertAt && now.getTime() - row.lastAlertAt.getTime() < cooldownMs) return undefined;
              await tx.update(agentPools).set({ lastAlertAt: now }).where(eq(agentPools.id, agentPoolId));
              return { previous: row.lastAlertAt };
            }),
          ).pipe(Effect.map(Option.fromNullishOr)),

        releaseCooldown: (agentPoolId, claimedAt, previous) =>
          run("releaseCooldown", () =>
            db
              .update(agentPools)
              .set({ lastAlertAt: previous })
              .where(and(eq(agentPools.id, agentPoolId), eq(agentPools.lastAlertAt, claimedAt))),
          ).pipe(Effect.asVoid),

        recordAlerts: (alerts) =>
          alerts.length === 0
            ? Effect.succeed([])
            : run("recordAlerts", () =>
                db
                  .insert(agentAlerts)
                  .values(alerts.map((a) => ({ ...a, ratio: Math.min(a.ratio, MAX_STORED_RATIO), delivered: false })))
                  .returning({ id: agentAlerts.id }),
              ).pipe(Effect.map((rows) => rows.map((r) => r.id))),

        markDelivered: (ids) =>
          ids.length === 0
            ? Effect.void
            : run("markDelivered", () =>
                db
                  .update(agentAlerts)
                  .set({ delivered: true, error: null })
                  .where(inArray(agentAlerts.id, [...ids])),
              ).pipe(Effect.asVoid),

        markFailed: (ids, error) =>
          ids.length === 0
            ? Effect.void
            : run("markFailed", () =>
                db
                  .update(agentAlerts)
                  .set({ delivered: false, error })
                  .where(inArray(agentAlerts.id, [...ids])),
              ).pipe(Effect.asVoid),
      });
    }),
  );
}
