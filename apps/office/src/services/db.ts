import { closeDb, createDb } from "@vexis/db/client";
import type { Decision, DecisionRefusal, ProposalStatus } from "@vexis/db/office";
import {
  decideProposal,
  expireProposals,
  insertJournal,
  insertMessage,
  insertProposal,
  insertRun,
  type JournalRow,
  killOffice,
  lastExecutionAt,
  linkedOfficeBots,
  listJournal,
  listOffices,
  listProposals,
  llmSpendToday,
  moveProposal,
  type NewProposal,
  type OfficeConfigRow,
  type ProposalRow,
  resumeOffice,
  setCardMessage,
  settledCards,
  setUpdateOffset,
  updateOfficeConfig,
} from "@vexis/db/office-queries";
import { forUser, getTelegramLink, listAlerts, listPoolsOfKind } from "@vexis/db/queries";
import { type officeJournal, type officeMessages, type officeRuns, rebalanceWallets } from "@vexis/db/schema";
import { decryptSecret } from "@vexis/db/secret";
import { eq } from "drizzle-orm";
import { Config, Context, Effect, Layer, Redacted } from "effect";
import { DbError } from "../errors.ts";

export type NewMessage = Omit<typeof officeMessages.$inferInsert, "id" | "userId" | "at">;
export type NewRun = Omit<typeof officeRuns.$inferInsert, "id" | "userId">;
export type NewJournal = Omit<typeof officeJournal.$inferInsert, "id" | "userId" | "openedAt">;
export type MovePatch = Parameters<typeof moveProposal>[4];
export type SpendRow = { readonly keySource: string; readonly usd: number };
export type Spike = { readonly poolAddress: string; readonly ratio: number; readonly vol1m: number; readonly at: Date };

/**
 * The office's wallet: its public key and the RPC to read it through, never its secret (nothing in the MVP signs).
 * `unreadable` when the RPC URL does not decrypt with this `WALLET_ENC_KEY`.
 */
export type WalletTarget =
  | { readonly _tag: "missing" }
  | { readonly _tag: "unreadable" }
  | { readonly _tag: "ready"; readonly owner: string; readonly rpcUrl: string };

/** The owner's office bot: `unreadable` when the token does not decrypt with this `TOKEN_ENC_KEY`. */
export type BotTarget =
  | { readonly _tag: "missing" }
  | { readonly _tag: "unreadable" }
  | { readonly _tag: "ready"; readonly token: string; readonly chatId: number };

/** A linked office bot to poll, with the offset that confirms what was already handled. */
export type PolledBot = {
  readonly userId: string;
  readonly token: string;
  readonly chatId: number;
  readonly offset: number | null;
};

export type DecideResult =
  | { readonly ok: true; readonly proposal: ProposalRow }
  | { readonly ok: false; readonly refusal: DecisionRefusal };

export type ResumeResult = Awaited<ReturnType<typeof resumeOffice>>;

/** Everything the office runtime reads or writes in Postgres. Every per-office call is scoped to that user. */
export class Db extends Context.Service<
  Db,
  {
    listOffices(): Effect.Effect<ReadonlyArray<OfficeConfigRow>, DbError>;
    expire(userId: string, now: Date): Effect.Effect<ReadonlyArray<ProposalRow>, DbError>;
    proposals(userId: string, statuses: readonly ProposalStatus[]): Effect.Effect<ReadonlyArray<ProposalRow>, DbError>;
    /** Undefined when another actor moved it first. */
    move(
      userId: string,
      proposalId: string,
      from: ProposalStatus,
      to: ProposalStatus,
      patch?: MovePatch,
    ): Effect.Effect<ProposalRow | undefined, DbError>;
    /** Undefined when the pool already has an unfinished proposal. */
    insertProposal(userId: string, p: NewProposal): Effect.Effect<ProposalRow | undefined, DbError>;
    message(userId: string, m: NewMessage): Effect.Effect<void, DbError>;
    insertRun(userId: string, r: NewRun): Effect.Effect<string, DbError>;
    spendToday(userId: string, now: Date): Effect.Effect<ReadonlyArray<SpendRow>, DbError>;
    openJournal(userId: string): Effect.Effect<ReadonlyArray<JournalRow>, DbError>;
    insertJournal(userId: string, j: NewJournal): Effect.Effect<void, DbError>;
    lastExecutionAt(userId: string, poolAddress: string): Effect.Effect<Date | null, DbError>;
    /** Pools one of the user's auto-rebalance agents manages. */
    rebalancePools(userId: string): Effect.Effect<ReadonlySet<string>, DbError>;
    /** The user's volume alerts after `since`, newest first. */
    spikesSince(userId: string, since: Date): Effect.Effect<ReadonlyArray<Spike>, DbError>;
    wallet(office: OfficeConfigRow): Effect.Effect<WalletTarget, DbError>;
    /** `null` clears the pause. */
    setPause(userId: string, pause: { reason: string; until: Date | null } | null): Effect.Effect<void, DbError>;
    officeBot(userId: string): Effect.Effect<BotTarget, DbError>;
    /** Every office with a linked bot whose token decrypts. */
    polledBots(): Effect.Effect<ReadonlyArray<PolledBot>, DbError>;
    setUpdateOffset(userId: string, offset: number): Effect.Effect<void, DbError>;
    setCard(userId: string, proposalId: string, messageId: number | null): Effect.Effect<void, DbError>;
    /** Proposals whose card still has buttons but no longer waits. */
    settledCards(userId: string): Effect.Effect<ReadonlyArray<ProposalRow>, DbError>;
    /** The owner's decision, the same path as the web panel. */
    decide(userId: string, proposalId: string, decision: Decision, now: Date): Effect.Effect<DecideResult, DbError>;
    /** The kill switch, as on the web: how many proposals it rejected, null with no office. */
    kill(userId: string): Effect.Effect<number | null, DbError>;
    resume(userId: string, now: Date): Effect.Effect<ResumeResult, DbError>;
  }
>()("vexis/office/Db") {
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
      const as = (userId: string) => forUser(db, userId);

      const decryptRpc = (owner: string | null, rpcUrl: string | null): WalletTarget => {
        if (!owner || !rpcUrl) return { _tag: "missing" };
        try {
          return { _tag: "ready", owner, rpcUrl: decryptSecret(rpcUrl, "WALLET_ENC_KEY") };
        } catch {
          return { _tag: "unreadable" };
        }
      };

      const readToken = (blob: string) => {
        try {
          return decryptSecret(blob, "TOKEN_ENC_KEY");
        } catch {
          return null;
        }
      };

      return Db.of({
        listOffices: () => run("listOffices", () => listOffices(db)),
        expire: (userId, now) => run("expire", () => expireProposals(as(userId), now)),
        proposals: (userId, statuses) => run("proposals", () => listProposals(as(userId), { statuses })),
        move: (userId, id, from, to, patch) => run("move", () => moveProposal(as(userId), id, from, to, patch)),
        insertProposal: (userId, p) => run("insertProposal", () => insertProposal(as(userId), p)),
        message: (userId, m) => run("message", () => insertMessage(as(userId), m)),
        insertRun: (userId, r) => run("insertRun", () => insertRun(as(userId), r)),
        spendToday: (userId, now) => run("spendToday", () => llmSpendToday(as(userId), now)),
        openJournal: (userId) => run("openJournal", () => listJournal(as(userId), { openOnly: true })),
        insertJournal: (userId, j) => run("insertJournal", () => insertJournal(as(userId), j)).pipe(Effect.asVoid),
        lastExecutionAt: (userId, pool) => run("lastExecutionAt", () => lastExecutionAt(as(userId), pool)),
        rebalancePools: (userId) =>
          run("rebalancePools", () => listPoolsOfKind(as(userId), "auto-rebalance")).pipe(
            Effect.map((rows) => new Set(rows.map((r) => r.poolAddress))),
          ),
        spikesSince: (userId, since) =>
          run("spikesSince", () => listAlerts(as(userId), { limit: 20 })).pipe(
            Effect.map((rows) =>
              rows
                .filter((r) => r.at > since)
                .map((r) => ({ poolAddress: r.poolAddress, ratio: r.ratio, vol1m: r.vol1m, at: r.at })),
            ),
          ),
        wallet: (office) =>
          office.walletSource === "office"
            ? Effect.succeed(decryptRpc(office.officePublicKey, office.officeRpcUrl))
            : run("wallet", () =>
                db
                  .select({ owner: rebalanceWallets.publicKey, rpcUrl: rebalanceWallets.rpcUrl })
                  .from(rebalanceWallets)
                  .where(eq(rebalanceWallets.userId, office.userId)),
              ).pipe(Effect.map(([row]) => decryptRpc(row?.owner ?? null, row?.rpcUrl ?? null))),
        setPause: (userId, pause) =>
          run("setPause", () =>
            updateOfficeConfig(
              as(userId),
              pause
                ? { paused: true, pausedReason: pause.reason, pausedUntil: pause.until }
                : { paused: false, pausedReason: null, pausedUntil: null },
            ),
          ).pipe(Effect.asVoid),
        officeBot: (userId) =>
          run("officeBot", () => getTelegramLink(as(userId), "office")).pipe(
            Effect.map((link): BotTarget => {
              if (!link || link.chatId === null) return { _tag: "missing" };
              const token = readToken(link.botToken);
              return token === null ? { _tag: "unreadable" } : { _tag: "ready", token, chatId: Number(link.chatId) };
            }),
          ),
        polledBots: () =>
          run("polledBots", () => linkedOfficeBots(db)).pipe(
            Effect.map((rows) =>
              rows.flatMap((r) => {
                const token = readToken(r.botToken);
                if (token === null || r.chatId === null) return [];
                return [{ userId: r.userId, token, chatId: Number(r.chatId), offset: r.updateOffset }];
              }),
            ),
          ),
        setUpdateOffset: (userId, offset) => run("setUpdateOffset", () => setUpdateOffset(as(userId), offset)),
        setCard: (userId, id, messageId) => run("setCard", () => setCardMessage(as(userId), id, messageId)),
        settledCards: (userId) => run("settledCards", () => settledCards(as(userId))),
        decide: (userId, id, decision, now) => run("decide", () => decideProposal(as(userId), id, decision, now)),
        kill: (userId) => run("kill", () => killOffice(as(userId))),
        resume: (userId, now) => run("resume", () => resumeOffice(as(userId), now)),
      });
    }),
  );
}
