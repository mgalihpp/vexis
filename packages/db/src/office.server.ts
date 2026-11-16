import { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "./client.server.ts";
import {
  type Decider,
  type OfficeAgent,
  type ProposalKind,
  type ProposalStatus,
  type Proposer,
  transition,
  utcDayStart,
} from "./office.ts";
import type { UserScope } from "./queries.server.ts";
import { officeConfig, officeJournal, officeMessages, officeProposals, officeRuns } from "./schema.ts";

// Office reads and writes. Like `queries.server.ts`, every helper for a user's office takes a `UserScope`; the two
// cross-user reads at the bottom are for `apps/office`, which runs every office in turn.

export type OfficeConfigRow = typeof officeConfig.$inferSelect;
export type ProposalRow = typeof officeProposals.$inferSelect;
export type MessageRow = typeof officeMessages.$inferSelect;
export type RunRow = typeof officeRuns.$inferSelect;
export type JournalRow = typeof officeJournal.$inferSelect;

// --- config ----------------------------------------------------------------------------------

/** Undefined when the user has no office (an admin has not enabled one). */
export function getOfficeConfig({ db, userId }: UserScope) {
  return db
    .select()
    .from(officeConfig)
    .where(eq(officeConfig.userId, userId))
    .then((rows) => rows[0]);
}

type ConfigPatch = Partial<Omit<typeof officeConfig.$inferInsert, "userId" | "createdAt" | "updatedAt">>;

/** False when the user has no office. Callers parse `guardrails` and `models` before they write them. */
export async function updateOfficeConfig({ db, userId }: UserScope, patch: ConfigPatch) {
  const rows = await db
    .update(officeConfig)
    .set(patch)
    .where(eq(officeConfig.userId, userId))
    .returning({ userId: officeConfig.userId });
  return rows.length > 0;
}

/**
 * Lifts a pause only while `reason` is still the reason and its `paused_until`, if any, has passed, so an admin
 * stop set in between stays. False when nothing was lifted.
 */
export async function clearPause({ db, userId }: UserScope, reason: string, now: Date) {
  const rows = await db
    .update(officeConfig)
    .set({ paused: false, pausedReason: null, pausedUntil: null })
    .where(
      and(
        eq(officeConfig.userId, userId),
        eq(officeConfig.paused, true),
        eq(officeConfig.pausedReason, reason),
        or(isNull(officeConfig.pausedUntil), lte(officeConfig.pausedUntil, now)),
      ),
    )
    .returning({ userId: officeConfig.userId });
  return rows.length > 0;
}

/** Admin only (`db:office`): creates the office, or updates its Vexis-key cap. */
export async function enableOffice({ db, userId }: UserScope, vexisDailyUsd: number) {
  await db
    .insert(officeConfig)
    .values({ userId, vexisDailyUsd })
    .onConflictDoUpdate({ target: officeConfig.userId, set: { vexisDailyUsd } });
}

/** Admin only: turns the office off. Proposals, feed, runs and journal reference the user, so they stay. */
export async function disableOffice({ db, userId }: UserScope) {
  await db.delete(officeConfig).where(eq(officeConfig.userId, userId));
}

// --- proposals -------------------------------------------------------------------------------

export function listProposals(
  { db, userId }: UserScope,
  options: { statuses?: readonly ProposalStatus[]; limit?: number } = {},
) {
  return db
    .select()
    .from(officeProposals)
    .where(
      and(
        eq(officeProposals.userId, userId),
        options.statuses ? inArray(officeProposals.status, [...options.statuses]) : undefined,
      ),
    )
    .orderBy(desc(officeProposals.createdAt))
    .limit(Math.min(options.limit ?? 50, 500));
}

export function getProposal({ db, userId }: UserScope, proposalId: string) {
  return db
    .select()
    .from(officeProposals)
    .where(and(eq(officeProposals.id, proposalId), eq(officeProposals.userId, userId)))
    .then((rows) => rows[0]);
}

export type NewProposal = {
  kind: ProposalKind;
  poolAddress: string;
  poolName: string | null;
  positionAddress?: string | null;
  params: Record<string, unknown>;
  rationale: string;
  proposedBy: Proposer;
  runId?: string | null;
  expiresAt: Date;
};

/**
 * Inserts a draft. Undefined when the pool already has an unfinished proposal: the partial unique index refuses
 * it, and a duplicate draft is dropped rather than queued.
 */
export async function insertProposal({ db, userId }: UserScope, p: NewProposal) {
  const [row] = await db
    .insert(officeProposals)
    .values({ userId, status: "draft", ...p })
    .onConflictDoNothing()
    .returning();
  return row;
}

type ProposalPatch = Partial<
  Pick<typeof officeProposals.$inferInsert, "riskNotes" | "summary" | "signature" | "txError" | "expiresAt">
> & { decidedBy?: Decider };

/**
 * Moves a proposal from `from` to `to`, only if it is still at `from`. Undefined when another actor moved it
 * first (approved and expired at once, say), so two writers never both win. Throws for an illegal move.
 */
export async function moveProposal(
  { db, userId }: UserScope,
  proposalId: string,
  from: ProposalStatus,
  to: ProposalStatus,
  patch: ProposalPatch = {},
) {
  const [row] = await db
    .update(officeProposals)
    .set({ ...patch, status: transition(from, to) })
    .where(
      and(eq(officeProposals.id, proposalId), eq(officeProposals.userId, userId), eq(officeProposals.status, from)),
    )
    .returning();
  return row;
}

/** How many proposals reached each status since `since` (by their last update). */
export function proposalCountsSince({ db, userId }: UserScope, since: Date) {
  return db
    .select({ status: officeProposals.status, count: sql<number>`count(*)::int` })
    .from(officeProposals)
    .where(and(eq(officeProposals.userId, userId), gte(officeProposals.updatedAt, since)))
    .groupBy(officeProposals.status);
}

/** The kill switch: every proposal not yet executing is rejected. Returns how many. */
export async function rejectUnexecuted({ db, userId }: UserScope, decidedBy: Decider) {
  const rows = await db
    .update(officeProposals)
    .set({ status: "rejected", decidedBy })
    .where(
      and(
        eq(officeProposals.userId, userId),
        inArray(officeProposals.status, ["draft", "risk_checked", "awaiting_approval", "approved"]),
      ),
    )
    .returning({ id: officeProposals.id });
  return rows.length;
}

/** Proposals whose approval window passed. Returns them so the caller can tell the feed. */
export async function expireProposals({ db, userId }: UserScope, now: Date) {
  return db
    .update(officeProposals)
    .set({ status: "expired", decidedBy: "system" })
    .where(
      and(
        eq(officeProposals.userId, userId),
        inArray(officeProposals.status, ["risk_checked", "awaiting_approval"]),
        lt(officeProposals.expiresAt, now),
      ),
    )
    .returning();
}

/** When the pool last had an execution finish, for the cooldown. */
export async function lastExecutionAt({ db, userId }: UserScope, poolAddress: string) {
  const [row] = await db
    .select({ at: sql<Date | null>`max(${officeProposals.updatedAt})` })
    .from(officeProposals)
    .where(
      and(
        eq(officeProposals.userId, userId),
        eq(officeProposals.poolAddress, poolAddress),
        inArray(officeProposals.status, ["done", "failed"]),
      ),
    );
  return row?.at ? new Date(row.at) : null;
}

// --- messages --------------------------------------------------------------------------------

export function listMessages(
  { db, userId }: UserScope,
  options: { agent?: OfficeAgent; poolAddress?: string; limit?: number } = {},
) {
  return db
    .select()
    .from(officeMessages)
    .where(
      and(
        eq(officeMessages.userId, userId),
        options.agent ? eq(officeMessages.agent, options.agent) : undefined,
        options.poolAddress ? eq(officeMessages.poolAddress, options.poolAddress) : undefined,
      ),
    )
    .orderBy(desc(officeMessages.at))
    .limit(Math.min(options.limit ?? 100, 500));
}

export async function insertMessage(
  { db, userId }: UserScope,
  m: Omit<typeof officeMessages.$inferInsert, "id" | "userId" | "at">,
) {
  await db.insert(officeMessages).values({ userId, ...m });
}

// --- runs ------------------------------------------------------------------------------------

export async function insertRun({ db, userId }: UserScope, r: Omit<typeof officeRuns.$inferInsert, "id" | "userId">) {
  const [row] = await db
    .insert(officeRuns)
    .values({ userId, ...r })
    .returning({ id: officeRuns.id });
  if (!row) throw new Error("insertRun: not inserted");
  return row.id;
}

/** LLM spend since the start of the UTC day holding `now`, per provider and key source. */
export async function llmSpendToday({ db, userId }: UserScope, now: Date) {
  return db
    .select({
      provider: officeRuns.provider,
      keySource: officeRuns.keySource,
      usd: sql<number>`coalesce(sum(${officeRuns.costUsd}), 0)::float8`,
      runs: sql<number>`count(*)::int`,
    })
    .from(officeRuns)
    .where(and(eq(officeRuns.userId, userId), gte(officeRuns.at, utcDayStart(now))))
    .groupBy(officeRuns.provider, officeRuns.keySource);
}

/** The latest run per agent, for each desk's status. */
export function latestRuns({ db, userId }: UserScope, limit = 50) {
  return db.select().from(officeRuns).where(eq(officeRuns.userId, userId)).orderBy(desc(officeRuns.at)).limit(limit);
}

// --- journal ---------------------------------------------------------------------------------

export function listJournal({ db, userId }: UserScope, options: { openOnly?: boolean; limit?: number } = {}) {
  return db
    .select()
    .from(officeJournal)
    .where(and(eq(officeJournal.userId, userId), options.openOnly ? isNull(officeJournal.closedAt) : undefined))
    .orderBy(desc(officeJournal.openedAt))
    .limit(Math.min(options.limit ?? 100, 500));
}

export async function insertJournal(
  { db, userId }: UserScope,
  j: Omit<typeof officeJournal.$inferInsert, "id" | "userId" | "openedAt">,
) {
  const [row] = await db
    .insert(officeJournal)
    .values({ userId, ...j })
    .returning();
  return row;
}

/**
 * Realized PnL of closed positions, all time and since `since`. A sum is null when no row in it has a PnL, so an
 * unpriced simulated close never reads as zero.
 */
export async function journalPnl({ db, userId }: UserScope, since: Date) {
  const today = sql`${officeJournal.closedAt} >= ${since.toISOString()}::timestamptz`;
  const [row] = await db
    .select({
      totalSol: sql<number | null>`sum(${officeJournal.pnlSol})::float8`,
      totalUsd: sql<number | null>`sum(${officeJournal.pnlUsd})::float8`,
      todaySol: sql<number | null>`(sum(${officeJournal.pnlSol}) filter (where ${today}))::float8`,
      todayUsd: sql<number | null>`(sum(${officeJournal.pnlUsd}) filter (where ${today}))::float8`,
    })
    .from(officeJournal)
    .where(and(eq(officeJournal.userId, userId), sql`${officeJournal.closedAt} is not null`));
  return {
    today: { sol: row?.todaySol ?? null, usd: row?.todayUsd ?? null },
    total: { sol: row?.totalSol ?? null, usd: row?.totalUsd ?? null },
  };
}

/** Closes an open position. Undefined when it is not the user's or already closed. */
export async function closeJournal(
  { db, userId }: UserScope,
  journalId: string,
  close: { closeReason: string; closeProposalId?: string | null; pnlSol: number | null; pnlUsd: number | null },
) {
  const [row] = await db
    .update(officeJournal)
    .set({ ...close, closedAt: new Date() })
    .where(and(eq(officeJournal.id, journalId), eq(officeJournal.userId, userId), isNull(officeJournal.closedAt)))
    .returning();
  return row;
}

// --- cross-user (apps/office only) -----------------------------------------------------------

/** Every office, paused or not; the caller decides what a paused office may still do (expire, say). */
export function listOffices(db: Db) {
  return db.select().from(officeConfig);
}

/** The admin's global kill switch: pauses every office and rejects whatever has not executed. */
export async function stopAllOffices(db: Db, reason: string) {
  await db.transaction(async (tx) => {
    await tx.update(officeConfig).set({ paused: true, pausedReason: reason, pausedUntil: null });
    await tx
      .update(officeProposals)
      .set({ status: "rejected", decidedBy: "kill_switch" })
      .where(inArray(officeProposals.status, ["draft", "risk_checked", "awaiting_approval", "approved"]));
  });
}
