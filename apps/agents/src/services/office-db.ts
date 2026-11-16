import { closeDb, createDb } from "@vexis/db/client";
import {
  bookClose,
  closeJournal,
  insertJournal,
  insertMessage,
  insertProposal,
  type JournalRow,
  journalBook,
  lastExecutionAt,
  lastProposalAt,
  listOffices,
  listProposals,
  liveExecutions,
  liveOpenPositions,
  moveProposal,
  type NewProposal,
  type OfficeConfigRow,
  type ProposalRow,
  setJournalValue,
  unbookedCloses,
  updateOfficeConfig,
  usersWithApproved,
} from "@vexis/db/office-queries";
import { forUser, listPoolsOfKind } from "@vexis/db/queries";
import type { officeJournal, officeMessages } from "@vexis/db/schema";
import type { ProposalStatus } from "@vexis/shared/office";
import { decryptSecret } from "@vexis/shared/secret";
import { Config, Context, Effect, Layer, Redacted } from "effect";
import { DbError } from "../errors.ts";

export type { JournalRow, NewProposal, OfficeConfigRow, ProposalRow };

export type OfficeMessage = Omit<typeof officeMessages.$inferInsert, "id" | "userId" | "at">;
export type NewJournal = Omit<typeof officeJournal.$inferInsert, "id" | "userId" | "openedAt">;
export type JournalClose = Parameters<typeof closeJournal>[2];
export type ProposalPatch = Parameters<typeof moveProposal>[4];
export type Book = { readonly open: ReadonlyArray<JournalRow>; readonly closedToday: ReadonlyArray<JournalRow> };

/**
 * The office's wallet as the runner reads it without its secret: the public key and the RPC URL (decrypted). `user`
 * is the agent wallet saved for auto-rebalance, `office` the office's own.
 */
export type OfficeWallet =
  | { readonly _tag: "missing" }
  | { readonly _tag: "unreadable" }
  | { readonly _tag: "ready"; readonly owner: string; readonly rpcUrl: string };

/** A real open office position with the strategy it was opened with (null when the open proposal is gone). */
export type LivePosition = { readonly journal: JournalRow; readonly openParams: unknown };

/** The office tables as the runner's Executor and Monitor use them. Every per-user call goes through `forUser`. */
export class OfficeDb extends Context.Service<
  OfficeDb,
  {
    offices(): Effect.Effect<ReadonlyArray<OfficeConfigRow>, DbError>;
    usersWithApproved(): Effect.Effect<ReadonlyArray<string>, DbError>;
    proposals(userId: string, statuses: readonly ProposalStatus[]): Effect.Effect<ReadonlyArray<ProposalRow>, DbError>;
    /** Undefined when another writer moved it first. */
    move(
      userId: string,
      proposalId: string,
      from: ProposalStatus,
      to: ProposalStatus,
      patch?: ProposalPatch,
    ): Effect.Effect<ProposalRow | undefined, DbError>;
    /** Undefined when the pool already has an unfinished proposal. */
    insertProposal(userId: string, p: NewProposal): Effect.Effect<ProposalRow | undefined, DbError>;
    book(userId: string, since: Date): Effect.Effect<Book, DbError>;
    insertJournal(userId: string, j: NewJournal): Effect.Effect<void, DbError>;
    closeJournal(userId: string, journalId: string, close: JournalClose): Effect.Effect<void, DbError>;
    setJournalValue(userId: string, journalId: string, valueSol: number, at: Date): Effect.Effect<void, DbError>;
    livePositions(): Effect.Effect<ReadonlyArray<LivePosition>, DbError>;
    message(userId: string, m: OfficeMessage): Effect.Effect<void, DbError>;
    pause(userId: string, reason: string): Effect.Effect<void, DbError>;
    /** Newest live executions first, for the failure streak. */
    liveExecutions(
      userId: string,
      limit: number,
    ): Effect.Effect<ReadonlyArray<{ readonly status: ProposalStatus; readonly txError: string | null }>, DbError>;
    lastExecutionAt(userId: string, poolAddress: string): Effect.Effect<Date | null, DbError>;
    lastProposalAt(userId: string, poolAddress: string): Effect.Effect<Date | null, DbError>;
    rebalancePools(userId: string): Effect.Effect<ReadonlySet<string>, DbError>;
    /** Real closes not yet read by the Bookkeeper, closed at or before `before`. */
    unbookedCloses(before: Date): Effect.Effect<ReadonlyArray<JournalRow>, DbError>;
    bookClose(
      userId: string,
      journalId: string,
      pnl: { pnlSol: number | null; pnlUsd: number | null },
      at: Date,
    ): Effect.Effect<void, DbError>;
    wallet(office: OfficeConfigRow): Effect.Effect<OfficeWallet, DbError>;
  }
>()("vexis/agents/OfficeDb") {
  static readonly layer = Layer.effect(
    OfficeDb,
    Effect.gen(function* () {
      const url = yield* Config.Redacted("DATABASE_URL");
      const db = yield* Effect.acquireRelease(
        Effect.sync(() => createDb(Redacted.value(url), { max: 2 })),
        (client) => Effect.promise(() => closeDb(client)),
      );
      const run = <A>(operation: string, f: () => Promise<A>) =>
        Effect.tryPromise({ try: f, catch: (cause) => new DbError({ operation, cause }) });
      const as = (userId: string) => forUser(db, userId);

      const readRpc = (owner: string | null, rpcUrl: string | null): OfficeWallet => {
        if (!owner || !rpcUrl) return { _tag: "missing" };
        try {
          return { _tag: "ready", owner, rpcUrl: decryptSecret(rpcUrl, "RPC_ENC_KEY") };
        } catch {
          return { _tag: "unreadable" };
        }
      };

      return OfficeDb.of({
        offices: () => run("offices", () => listOffices(db)),
        usersWithApproved: () => run("usersWithApproved", () => usersWithApproved(db)),
        proposals: (userId, statuses) => run("proposals", () => listProposals(as(userId), { statuses })),
        move: (userId, id, from, to, patch) => run("move", () => moveProposal(as(userId), id, from, to, patch)),
        insertProposal: (userId, p) => run("insertProposal", () => insertProposal(as(userId), p)),
        book: (userId, since) => run("book", () => journalBook(as(userId), since)),
        insertJournal: (userId, j) => run("insertJournal", () => insertJournal(as(userId), j)).pipe(Effect.asVoid),
        closeJournal: (userId, id, close) =>
          run("closeJournal", () => closeJournal(as(userId), id, close)).pipe(Effect.asVoid),
        setJournalValue: (userId, id, valueSol, at) =>
          run("setJournalValue", () => setJournalValue(as(userId), id, valueSol, at)),
        livePositions: () => run("livePositions", () => liveOpenPositions(db)),
        message: (userId, m) => run("message", () => insertMessage(as(userId), m)),
        pause: (userId, reason) =>
          run("pause", () =>
            updateOfficeConfig(as(userId), { paused: true, pausedReason: reason, pausedUntil: null }),
          ).pipe(Effect.asVoid),
        liveExecutions: (userId, limit) => run("liveExecutions", () => liveExecutions(as(userId), limit)),
        lastExecutionAt: (userId, pool) => run("lastExecutionAt", () => lastExecutionAt(as(userId), pool)),
        lastProposalAt: (userId, pool) => run("lastProposalAt", () => lastProposalAt(as(userId), pool)),
        rebalancePools: (userId) =>
          run("rebalancePools", () => listPoolsOfKind(as(userId), "auto-rebalance")).pipe(
            Effect.map((rows) => new Set(rows.map((r) => r.poolAddress))),
          ),
        unbookedCloses: (before) => run("unbookedCloses", () => unbookedCloses(db, before)),
        bookClose: (userId, id, pnl, at) => run("bookClose", () => bookClose(as(userId), id, pnl, at)),
        wallet: (office) => Effect.succeed(readRpc(office.officePublicKey, office.officeRpcUrl)),
      });
    }),
  );
}
