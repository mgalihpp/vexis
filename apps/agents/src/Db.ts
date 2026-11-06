import type { Keypair } from "@solana/web3.js";
import {
  type AgentKind,
  REBALANCE_FAILING,
  REBALANCE_FAILURE_LIMIT,
  TELEGRAM_NOT_LINKED,
  TELEGRAM_RELINK,
  WALLET_UNREADABLE,
} from "@vexis/db/agents";
import { closeDb, createDb } from "@vexis/db/client";
import {
  agentAlerts,
  agentPools,
  agentRebalances,
  agents,
  poolMinutes,
  rebalanceWallets,
  telegramLinks,
} from "@vexis/db/schema";
import { decryptSecret } from "@vexis/db/secret";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";
import { DbError } from "./errors.ts";
import { walletSigner } from "./wallet.ts";

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

/** One (agent, pool) pair of a runnable auto-rebalance agent, with the wallet whose position it manages. */
export type RebalanceWatch = Watch & { readonly owner: string };

export type NewRebalance = {
  readonly agentId: string;
  readonly userId: string;
  readonly poolAddress: string;
  readonly positionAddress: string;
  readonly activeBin: number;
  readonly lowerBin: number;
  readonly upperBin: number;
  readonly newLowerBin: number;
  readonly newUpperBin: number;
  /** Sent on-chain (dryRun false), rather than a preview. */
  readonly live: boolean;
  readonly at: Date;
};

/** How a live rebalance ended: the confirmed signature, or why it failed. */
export type TxOutcome =
  | { readonly _tag: "sent"; readonly signature: string }
  | { readonly _tag: "failed"; readonly error: string };

/**
 * The agent wallet's signer. `unreadable`: the stored secret does not decrypt with this `WALLET_ENC_KEY` or does
 * not match its public key, so the user has to save the wallet again.
 */
export type WalletSigner =
  | { readonly _tag: "missing" }
  | { readonly _tag: "unreadable" }
  | { readonly _tag: "ready"; readonly signer: Keypair };

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

export { REBALANCE_FAILING, REBALANCE_FAILURE_LIMIT, TELEGRAM_NOT_LINKED, TELEGRAM_RELINK, WALLET_UNREADABLE };

/**
 * Where a user's alerts go. `unreadable`: a bot is linked but its token does not decrypt with this
 * `TOKEN_ENC_KEY` (the key changed after linking), so it is useless until the user links the bot again.
 */
export type TelegramTarget =
  | { readonly _tag: "missing" }
  | { readonly _tag: "unreadable" }
  | { readonly _tag: "ready"; readonly chatId: bigint; readonly botToken: string };

/** Rows newest first: how many failed before the first that did not. */
export const leadingFailures = (rows: ReadonlyArray<{ readonly txError: string | null }>) => {
  const ok = rows.findIndex((r) => r.txError === null);
  return ok === -1 ? rows.length : ok;
};

/** Postgres `double precision` takes Infinity but JSON does not; a zero baseline is stored capped. */
const MAX_STORED_RATIO = 1_000_000;

/** Everything the runner reads or writes in Postgres, as domain operations. */
export class Db extends Context.Service<
  Db,
  {
    /** Enabled, unpaused volume-watch agents joined with their pools. */
    runnableWatches(): Effect.Effect<ReadonlyArray<Watch>, DbError>;
    /** Enabled, unpaused auto-rebalance agents with a saved wallet, joined with their pools. */
    runnableRebalances(): Effect.Effect<ReadonlyArray<RebalanceWatch>, DbError>;
    /** Inserts with `delivered = false` and returns the new id. */
    recordRebalance(row: NewRebalance): Effect.Effect<string, DbError>;
    /** `error` null marks the row delivered; otherwise stores why the Telegram send failed. */
    settleRebalance(id: string, error: string | null): Effect.Effect<void, DbError>;
    /** Stores a live row's signature or transaction error. */
    settleTransaction(id: string, outcome: TxOutcome): Effect.Effect<void, DbError>;
    /** Failed live rebalances in a row, newest first, counting at most `REBALANCE_FAILURE_LIMIT`. */
    failureStreak(agentId: string): Effect.Effect<number, DbError>;
    /** Decrypts the agent wallet's secret. The only place anything decrypts it; the web app only writes it. */
    walletSigner(userId: string): Effect.Effect<WalletSigner, DbError>;
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
    /** Where a kind's alerts go: the chat and the bot token (decrypted) the user linked for it. Missing until both are. */
    telegramTarget(userId: string, kind: AgentKind): Effect.Effect<TelegramTarget, DbError>;
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

        runnableRebalances: () =>
          run("runnableRebalances", () =>
            db
              .select({
                agentId: agents.id,
                userId: agents.userId,
                agentPoolId: agentPools.id,
                poolAddress: agentPools.poolAddress,
                label: agentPools.label,
                config: agents.config,
                lastAlertAt: agentPools.lastAlertAt,
                owner: rebalanceWallets.publicKey,
              })
              .from(agents)
              .innerJoin(agentPools, and(eq(agentPools.agentId, agents.id), eq(agentPools.userId, agents.userId)))
              .innerJoin(rebalanceWallets, eq(rebalanceWallets.userId, agents.userId))
              .where(and(eq(agents.kind, "auto-rebalance"), eq(agents.enabled, true), eq(agents.paused, false))),
          ),

        recordRebalance: (row) =>
          run("recordRebalance", () =>
            db
              .insert(agentRebalances)
              .values({ ...row, delivered: false })
              .returning({ id: agentRebalances.id }),
          ).pipe(
            Effect.flatMap(([r]) =>
              r
                ? Effect.succeed(r.id)
                : Effect.fail(new DbError({ operation: "recordRebalance", cause: new Error("no row returned") })),
            ),
          ),

        settleRebalance: (id, error) =>
          run("settleRebalance", () =>
            db
              .update(agentRebalances)
              .set({ delivered: error === null, error })
              .where(eq(agentRebalances.id, id)),
          ).pipe(Effect.asVoid),

        settleTransaction: (id, outcome) =>
          run("settleTransaction", () =>
            db
              .update(agentRebalances)
              .set(
                outcome._tag === "sent"
                  ? { signature: outcome.signature, txError: null }
                  : { signature: null, txError: outcome.error },
              )
              .where(eq(agentRebalances.id, id)),
          ).pipe(Effect.asVoid),

        failureStreak: (agentId) =>
          run("failureStreak", () =>
            db
              .select({ txError: agentRebalances.txError })
              .from(agentRebalances)
              .where(and(eq(agentRebalances.agentId, agentId), eq(agentRebalances.live, true)))
              .orderBy(desc(agentRebalances.at))
              .limit(REBALANCE_FAILURE_LIMIT),
          ).pipe(Effect.map(leadingFailures)),

        walletSigner: (userId) =>
          run("walletSigner", async (): Promise<WalletSigner> => {
            const [row] = await db
              .select({ publicKey: rebalanceWallets.publicKey, secretKey: rebalanceWallets.secretKey })
              .from(rebalanceWallets)
              .where(eq(rebalanceWallets.userId, userId));
            if (!row) return { _tag: "missing" };
            let secret: string;
            try {
              secret = decryptSecret(row.secretKey, "WALLET_ENC_KEY");
            } catch {
              return { _tag: "unreadable" };
            }
            const signer = walletSigner(secret, row.publicKey);
            return signer ? { _tag: "ready", signer } : { _tag: "unreadable" };
          }),

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

        telegramTarget: (userId, kind) =>
          run("telegramTarget", async () => {
            const [row] = await db
              .select({ chatId: telegramLinks.chatId, botToken: telegramLinks.botToken })
              .from(telegramLinks)
              .where(and(eq(telegramLinks.userId, userId), eq(telegramLinks.kind, kind)));
            if (row?.chatId == null || !row.botToken) return { _tag: "missing" } as const;
            try {
              return { _tag: "ready", chatId: row.chatId, botToken: decryptSecret(row.botToken) } as const;
            } catch {
              return { _tag: "unreadable" } as const;
            }
          }),

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
