import {
  type AuditAction,
  type CreateInvite,
  escapeLike,
  type InviteStatus,
  inviteStatus,
  PAGE_SIZE,
  type Role,
  redact,
  roleChangeRefusal,
} from "@vexis/shared/admin";
import { ADMIN_STOP, isPaused, utcDayStart } from "@vexis/shared/office";
import { and, desc, eq, gt, gte, ilike, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "./client.server.ts";
import { disableOffice, enableOffice, resumeAllOffices, stopAllOffices } from "./office.server.ts";
import { createInvite, type Executor, forUser, revokeInvite } from "./queries.server.ts";
import {
  adminAudit,
  agentAlerts,
  agentPools,
  agentRebalances,
  agents,
  inviteRequests,
  invites,
  officeConfig,
  officeJournal,
  officeProposals,
  officeRuns,
  sessions,
  users,
  wallets,
} from "./schema.ts";

// Everything the admin page reads and writes. Reads name their columns: an office row holds LLM keys and an
// encrypted wallet secret, an invite row its token hash, a session its token, and none of that leaves this file.
// Every write runs in one transaction with its audit row, so an admin action without a record cannot happen.

export type Actor = { id: string; email: string };

const DAY_MS = 86_400_000;
/** A raw `sql` template does not know a parameter is a timestamp, so a Date has to say so. */
const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;
const like = (q: string) => `%${escapeLike(q)}%`;

export async function recordAudit(
  tx: Executor,
  actor: Actor,
  entry: {
    action: AuditAction;
    targetType: string;
    targetId?: string | null;
    targetLabel?: string | null;
    details?: Record<string, unknown>;
  },
) {
  await tx.insert(adminAudit).values({
    actorId: actor.id,
    actorEmail: actor.email,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    targetLabel: entry.targetLabel ?? null,
    details: entry.details ?? {},
  });
}

/** The role as the database has it right now. The session's cached role is never trusted for an admin check. */
export async function roleOf(db: Db, userId: string): Promise<Role | null> {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId));
  return row?.role ?? null;
}

// --- tab counts -------------------------------------------------------------------------------

export async function tabCounts(db: Db) {
  const [row] = await db
    .select({
      requests: sql<number>`(select count(*)::int from ${inviteRequests} where ${inviteRequests.invitedAt} is null)`,
      users: sql<number>`(select count(*)::int from ${users})`,
      offices: sql<number>`(select count(*)::int from ${officeConfig})`,
      pausedAgents: sql<number>`(select count(*)::int from ${agents} where ${agents.paused})`,
    })
    .from(sql`(select 1) as one`);
  return row ?? { requests: 0, users: 0, offices: 0, pausedAgents: 0 };
}

// --- invites ----------------------------------------------------------------------------------

const activeInvite = (now: Date) =>
  and(isNull(invites.revokedAt), gt(invites.expiresAt, now), lt(invites.useCount, invites.maxUses));
const redeemedInvite = and(isNull(invites.revokedAt), sql`${invites.useCount} >= ${invites.maxUses}`);
const expiredInvite = (now: Date) =>
  and(isNull(invites.revokedAt), lt(invites.useCount, invites.maxUses), lte(invites.expiresAt, now));

export async function inviteOverview(db: Db, now: Date) {
  const day = new Date(now.getTime() - DAY_MS);
  const soon = new Date(now.getTime() + 2 * DAY_MS);
  const [row] = await db
    .select({
      requestsPending: sql<number>`(select count(*)::int from ${inviteRequests} where ${inviteRequests.invitedAt} is null)`,
      requests24h: sql<number>`(select count(*)::int from ${inviteRequests} where ${inviteRequests.invitedAt} is null and ${inviteRequests.createdAt} >= ${ts(day)})`,
      active: sql<number>`count(*) filter (where ${activeInvite(now)})::int`,
      redeemed: sql<number>`count(*) filter (where ${invites.useCount} > 0)::int`,
      lost: sql<number>`count(*) filter (where ${invites.useCount} = 0 and (${invites.revokedAt} is not null or ${invites.expiresAt} <= ${ts(now)}))::int`,
      seatsUsed: sql<number>`coalesce(sum(${invites.useCount}) filter (where ${invites.revokedAt} is null), 0)::int`,
      seats: sql<number>`coalesce(sum(${invites.maxUses}) filter (where ${invites.revokedAt} is null), 0)::int`,
      expiring: sql<number>`count(*) filter (where ${activeInvite(now)} and ${invites.expiresAt} <= ${ts(soon)})::int`,
      all: sql<number>`count(*)::int`,
      expired: sql<number>`count(*) filter (where ${expiredInvite(now)})::int`,
      redeemedAll: sql<number>`count(*) filter (where ${redeemedInvite})::int`,
    })
    .from(invites);
  if (!row) throw new Error("inviteOverview: no row");
  return row;
}

export async function listInvites(
  db: Db,
  q: { filter: "all" | "active" | "redeemed" | "expired"; q?: string; page: number },
  now: Date,
) {
  const where = and(
    q.filter === "active"
      ? activeInvite(now)
      : q.filter === "redeemed"
        ? redeemedInvite
        : q.filter === "expired"
          ? expiredInvite(now)
          : undefined,
    q.q ? or(ilike(invites.email, like(q.q)), ilike(invites.note, like(q.q))) : undefined,
  );
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: invites.id,
        email: invites.email,
        note: invites.note,
        maxUses: invites.maxUses,
        useCount: invites.useCount,
        expiresAt: invites.expiresAt,
        revokedAt: invites.revokedAt,
        createdAt: invites.createdAt,
      })
      .from(invites)
      .where(where)
      .orderBy(desc(invites.createdAt))
      .limit(PAGE_SIZE)
      .offset((q.page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(invites).where(where),
  ]);
  return {
    total: total?.n ?? 0,
    rows: rows.map((r) => ({ ...r, status: inviteStatus(r, now.getTime()) satisfies InviteStatus })),
  };
}

export function listInviteRequests(db: Db) {
  return db
    .select({ email: inviteRequests.email, createdAt: inviteRequests.createdAt, invitedAt: inviteRequests.invitedAt })
    .from(inviteRequests)
    .orderBy(sql`${inviteRequests.invitedAt} desc nulls first`, desc(inviteRequests.createdAt))
    .limit(50);
}

/** The token is returned once and is never written to the audit row. */
export async function createInviteAudited(db: Db, actor: Actor, input: CreateInvite, now: Date) {
  return db.transaction(async (tx) => {
    const { token, invite } = await createInvite(tx, {
      createdBy: actor.id,
      email: input.email,
      note: input.note,
      maxUses: input.uses,
      expiresAt: new Date(now.getTime() + input.days * DAY_MS),
    });
    if (!invite) throw new Error("Invite was not created");
    await recordAudit(tx, actor, {
      action: "invite.create",
      targetType: "invite",
      targetId: invite.id,
      targetLabel: invite.email ?? "open link",
      details: { days: input.days, uses: input.uses, email: invite.email !== null, send: input.send },
    });
    return {
      token,
      invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt, maxUses: invite.maxUses },
    };
  });
}

/**
 * Answers a request: claims it (so a double click cannot send twice), creates its invite and records both.
 * Returns null when the request is gone or already answered.
 */
export async function inviteRequestAudited(db: Db, actor: Actor, email: string, now: Date) {
  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(inviteRequests)
      .set({ invitedAt: now })
      .where(and(eq(inviteRequests.email, email.toLowerCase()), isNull(inviteRequests.invitedAt)))
      .returning({ id: inviteRequests.id });
    if (!claimed) return null;
    const { token, invite } = await createInvite(tx, {
      createdBy: actor.id,
      email: email.toLowerCase(),
      maxUses: 1,
      expiresAt: new Date(now.getTime() + 7 * DAY_MS),
    });
    if (!invite) throw new Error("Invite was not created");
    await tx.update(inviteRequests).set({ inviteId: invite.id }).where(eq(inviteRequests.id, claimed.id));
    await recordAudit(tx, actor, {
      action: "invite.send",
      targetType: "invite_request",
      targetId: invite.id,
      targetLabel: invite.email,
      details: { days: 7, uses: 1 },
    });
    return { token, invite: { id: invite.id, email: invite.email, expiresAt: invite.expiresAt } };
  });
}

/** The mail did not go out: the invite is withdrawn and the request is open again, so Send works a second time. */
export async function undoInviteRequest(db: Db, actor: Actor, inviteId: string) {
  await db.transaction(async (tx) => {
    await revokeInvite(tx, inviteId);
    await tx
      .update(inviteRequests)
      .set({ invitedAt: null, inviteId: null })
      .where(eq(inviteRequests.inviteId, inviteId));
    await recordAudit(tx, actor, {
      action: "invite.revoke",
      targetType: "invite",
      targetId: inviteId,
      details: { reason: "mail not sent" },
    });
  });
}

export async function revokeInviteAudited(db: Db, actor: Actor, inviteId: string) {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select({ email: invites.email })
      .from(invites)
      .where(eq(invites.id, inviteId))
      .for("update");
    if (!invite) return "not-found" as const;
    if (!(await revokeInvite(tx, inviteId))) return "unchanged" as const;
    await recordAudit(tx, actor, {
      action: "invite.revoke",
      targetType: "invite",
      targetId: inviteId,
      targetLabel: invite.email ?? "open link",
    });
    return "ok" as const;
  });
}

/** Seven more days from now or from the current expiry, whichever is later. Revoked and fully used invites stay put. */
export async function extendInviteAudited(db: Db, actor: Actor, inviteId: string, now: Date) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(invites)
      .set({ expiresAt: sql`greatest(${invites.expiresAt}, ${ts(now)}) + interval '7 days'` })
      .where(and(eq(invites.id, inviteId), isNull(invites.revokedAt), lt(invites.useCount, invites.maxUses)))
      .returning({ email: invites.email, expiresAt: invites.expiresAt });
    if (!row) return null;
    await recordAudit(tx, actor, {
      action: "invite.extend",
      targetType: "invite",
      targetId: inviteId,
      targetLabel: row.email ?? "open link",
      details: { days: 7 },
    });
    return row.expiresAt;
  });
}

// --- users ------------------------------------------------------------------------------------

export async function userOverview(db: Db, now: Date) {
  const week = new Date(now.getTime() - 7 * DAY_MS);
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      new7d: sql<number>`count(*) filter (where ${users.createdAt} >= ${ts(week)})::int`,
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
      withOffice: sql<number>`(select count(*)::int from ${officeConfig})`,
      active7d: sql<number>`(select count(distinct ${sessions.userId})::int from ${sessions} where ${sessions.updatedAt} >= ${ts(week)})`,
    })
    .from(users);
  if (!row) throw new Error("userOverview: no row");
  return row;
}

export async function listUsers(db: Db, q: { filter: "all" | "admins" | "office"; q?: string; page: number }) {
  const where = and(
    q.filter === "admins" ? eq(users.role, "admin") : undefined,
    q.filter === "office" ? isNotNull(officeConfig.userId) : undefined,
    q.q ? or(ilike(users.email, like(q.q)), ilike(users.name, like(q.q))) : undefined,
  );
  const from = db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .leftJoin(officeConfig, eq(officeConfig.userId, users.id));
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        createdAt: users.createdAt,
        wallets: sql<number>`(select count(*)::int from ${wallets} where ${wallets.userId} = ${users.id})`,
        agents: sql<number>`(select count(*)::int from ${agents} where ${agents.userId} = ${users.id})`,
        officeLive: officeConfig.live,
        officePaused: officeConfig.paused,
        officePausedUntil: officeConfig.pausedUntil,
        hasOffice: isNotNull(officeConfig.userId),
      })
      .from(users)
      .leftJoin(officeConfig, eq(officeConfig.userId, users.id))
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((q.page - 1) * PAGE_SIZE),
    from.where(where),
  ]);
  const now = Date.now();
  return {
    total: total?.n ?? 0,
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role,
      createdAt: r.createdAt,
      wallets: r.wallets,
      agents: r.agents,
      office: !r.hasOffice
        ? null
        : isPaused(
              {
                paused: r.officePaused ?? false,
                pausedReason: null,
                pausedUntil: r.officePausedUntil?.getTime() ?? null,
              },
              now,
            )
          ? ("paused" as const)
          : r.officeLive
            ? ("live" as const)
            : ("preview" as const),
    })),
  };
}

/**
 * Sets a user's role. Every admin row is locked first, so two admins demoting each other at once cannot both pass
 * the last-admin check.
 */
export async function setUserRoleAudited(db: Db, actor: Actor, targetId: string, to: Role) {
  return db.transaction(async (tx) => {
    const admins = await tx.select({ id: users.id }).from(users).where(eq(users.role, "admin")).for("update");
    const [target] = await tx
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.id, targetId))
      .for("update");
    if (!target) return "not-found" as const;
    const refusal = roleChangeRefusal({
      actorId: actor.id,
      targetId,
      from: target.role,
      to,
      adminIds: admins.map((a) => a.id),
    });
    if (refusal) return refusal;
    await tx.update(users).set({ role: to }).where(eq(users.id, targetId));
    await recordAudit(tx, actor, {
      action: "role.change",
      targetType: "user",
      targetId,
      targetLabel: target.email,
      details: { from: target.role, to },
    });
    return "ok" as const;
  });
}

// --- offices ----------------------------------------------------------------------------------

export async function officeOverview(db: Db, now: Date) {
  const day = utcDayStart(now);
  const [row] = await db
    .select({
      offices: sql<number>`count(*)::int`,
      live: sql<number>`count(*) filter (where ${officeConfig.live})::int`,
      adminStopped: sql<number>`count(*) filter (where ${officeConfig.paused} and ${officeConfig.pausedReason} = ${ADMIN_STOP})::int`,
      paused: sql<number>`count(*) filter (where ${officeConfig.paused} and (${officeConfig.pausedUntil} is null or ${officeConfig.pausedUntil} > ${ts(now)}))::int`,
      vexisCap: sql<number>`coalesce(sum(${officeConfig.vexisDailyUsd}) filter (where ${officeConfig.keySource} = 'vexis'), 0)::float8`,
      proposalsToday: sql<number>`(select count(*)::int from ${officeProposals} where ${officeProposals.createdAt} >= ${ts(day)})`,
      waiting: sql<number>`(select count(*)::int from ${officeProposals} where ${officeProposals.status} = 'awaiting_approval')`,
      vexisSpend: sql<number>`(select coalesce(sum(${officeRuns.costUsd}), 0)::float8 from ${officeRuns} where ${officeRuns.keySource} = 'vexis' and ${officeRuns.at} >= ${ts(day)})`,
    })
    .from(officeConfig);
  if (!row) throw new Error("officeOverview: no row");
  return row;
}

export async function listOffices(db: Db, q: { filter: "all" | "live" | "paused"; q?: string }, now: Date) {
  const day = utcDayStart(now);
  const where = and(
    q.filter === "live" ? eq(officeConfig.live, true) : undefined,
    q.filter === "paused"
      ? and(eq(officeConfig.paused, true), or(isNull(officeConfig.pausedUntil), gt(officeConfig.pausedUntil, now)))
      : undefined,
    q.q ? ilike(users.email, like(q.q)) : undefined,
  );
  const rows = await db
    .select({
      userId: officeConfig.userId,
      email: users.email,
      since: officeConfig.createdAt,
      live: officeConfig.live,
      paused: officeConfig.paused,
      pausedReason: officeConfig.pausedReason,
      pausedUntil: officeConfig.pausedUntil,
      poolPreset: officeConfig.poolPreset,
      keySource: officeConfig.keySource,
      vexisDailyUsd: officeConfig.vexisDailyUsd,
      ownCap: sql<number | null>`(${officeConfig.guardrails} ->> 'dailyLlmUsd')::float8`,
      spend: sql<number>`(select coalesce(sum(${officeRuns.costUsd}), 0)::float8 from ${officeRuns} where ${officeRuns.userId} = ${officeConfig.userId} and ${officeRuns.at} >= ${ts(day)})`,
      open: sql<number>`(select count(*)::int from ${officeJournal} where ${officeJournal.userId} = ${officeConfig.userId} and ${officeJournal.closedAt} is null)`,
    })
    .from(officeConfig)
    .innerJoin(users, eq(users.id, officeConfig.userId))
    .where(where)
    .orderBy(desc(officeConfig.createdAt))
    .limit(200);
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    since: r.since,
    live: r.live,
    paused: isPaused(
      { paused: r.paused, pausedReason: r.pausedReason, pausedUntil: r.pausedUntil?.getTime() ?? null },
      now.getTime(),
    ),
    pausedReason: r.pausedReason,
    poolPreset: r.poolPreset,
    keySource: r.keySource,
    spend: r.spend,
    cap: r.keySource === "vexis" ? r.vexisDailyUsd : (r.ownCap ?? 1),
    open: r.open,
  }));
}

export async function enableOfficeAudited(db: Db, actor: Actor, email: string, vexisDailyUsd: number) {
  return db.transaction(async (tx) => {
    const [user] = await tx.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, email));
    if (!user) return "no-user" as const;
    const [existing] = await tx
      .select({ userId: officeConfig.userId })
      .from(officeConfig)
      .where(eq(officeConfig.userId, user.id));
    await enableOffice(forUser(tx, user.id), vexisDailyUsd);
    await recordAudit(tx, actor, {
      action: "office.enable",
      targetType: "office",
      targetId: user.id,
      targetLabel: user.email,
      details: { vexisDailyUsd, existed: existing !== undefined },
    });
    return "ok" as const;
  });
}

/** Refused while the office holds a real open position: disabling deletes its config, and the Monitor would lose it. */
export async function disableOfficeAudited(db: Db, actor: Actor, userId: string) {
  return db.transaction(async (tx) => {
    const [office] = await tx
      .select({ email: users.email })
      .from(officeConfig)
      .innerJoin(users, eq(users.id, officeConfig.userId))
      .where(eq(officeConfig.userId, userId))
      .for("update", { of: officeConfig });
    if (!office) return "not-found" as const;
    const [open] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(officeJournal)
      .where(and(eq(officeJournal.userId, userId), eq(officeJournal.simulated, false), isNull(officeJournal.closedAt)));
    if ((open?.n ?? 0) > 0) return "positions-open" as const;
    await disableOffice(forUser(tx, userId));
    await recordAudit(tx, actor, {
      action: "office.disable",
      targetType: "office",
      targetId: userId,
      targetLabel: office.email,
    });
    return "ok" as const;
  });
}

export async function setOfficeCapAudited(db: Db, actor: Actor, userId: string, vexisDailyUsd: number) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(officeConfig)
      .set({ vexisDailyUsd })
      .where(eq(officeConfig.userId, userId))
      .returning({ userId: officeConfig.userId });
    if (!row) return "not-found" as const;
    const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId));
    await recordAudit(tx, actor, {
      action: "office.cap",
      targetType: "office",
      targetId: userId,
      targetLabel: user?.email ?? null,
      details: { vexisDailyUsd },
    });
    return "ok" as const;
  });
}

export async function stopAllAudited(db: Db, actor: Actor) {
  return db.transaction(async (tx) => {
    const result = await stopAllOffices(tx, ADMIN_STOP);
    await recordAudit(tx, actor, { action: "office.stop_all", targetType: "office", details: result });
    return result;
  });
}

export async function resumeAllAudited(db: Db, actor: Actor) {
  return db.transaction(async (tx) => {
    const resumed = await resumeAllOffices(tx, ADMIN_STOP);
    await recordAudit(tx, actor, { action: "office.resume_all", targetType: "office", details: { resumed } });
    return resumed;
  });
}

// --- agents -----------------------------------------------------------------------------------

export async function agentOverview(db: Db, now: Date) {
  const day = new Date(now.getTime() - DAY_MS);
  const [row] = await db
    .select({
      volume: sql<number>`count(*) filter (where ${agents.kind} = 'volume-watch')::int`,
      screener: sql<number>`count(*) filter (where ${agents.kind} = 'volume-watch' and ${agents.config} ->> 'source' = 'screener')::int`,
      rebalance: sql<number>`count(*) filter (where ${agents.kind} = 'auto-rebalance')::int`,
      rebalanceLive: sql<number>`count(*) filter (where ${agents.kind} = 'auto-rebalance' and ${agents.config} ->> 'dryRun' = 'false')::int`,
      paused: sql<number>`count(*) filter (where ${agents.paused})::int`,
      alerts: sql<number>`(select count(*)::int from ${agentAlerts} where ${agentAlerts.at} >= ${ts(day)})`,
      alertsFailed: sql<number>`(select count(*)::int from ${agentAlerts} where ${agentAlerts.at} >= ${ts(day)} and ${agentAlerts.error} is not null)`,
      txFailed: sql<number>`(select count(*)::int from ${agentRebalances} where ${agentRebalances.at} >= ${ts(day)} and (${agentRebalances.txError} is not null or ${agentRebalances.error} is not null))`,
    })
    .from(agents);
  if (!row) throw new Error("agentOverview: no row");
  return row;
}

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

export async function listPausedAgents(db: Db) {
  const rows = await db
    .select({
      id: agents.id,
      kind: agents.kind,
      email: users.email,
      reason: agents.pausedReason,
      since: agents.updatedAt,
      source: sql<string | null>`${agents.config} ->> 'source'`,
      preset: sql<string | null>`${agents.config} ->> 'preset'`,
      pools: sql<number>`(select count(*)::int from ${agentPools} where ${agentPools.agentId} = ${agents.id})`,
      pool: sql<
        string | null
      >`(select coalesce(${agentPools.label}, ${agentPools.poolAddress}) from ${agentPools} where ${agentPools.agentId} = ${agents.id} order by ${agentPools.createdAt} limit 1)`,
    })
    .from(agents)
    .innerJoin(users, eq(users.id, agents.userId))
    .where(eq(agents.paused, true))
    .orderBy(desc(agents.updatedAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    email: r.email,
    reason: r.reason,
    since: r.since,
    name:
      r.kind === "auto-rebalance"
        ? r.pool
          ? r.pool.length > 20
            ? short(r.pool)
            : r.pool
          : "Auto-rebalance"
        : "Volume watch",
    detail:
      r.kind === "auto-rebalance"
        ? "Auto-rebalance"
        : r.source === "screener"
          ? `${r.preset ?? "Screener"} screener`
          : `${r.pools} pool${r.pools === 1 ? "" : "s"}`,
  }));
}

/** Failed alerts and transactions of the last 7 days, newest first. Error text is redacted before it leaves. */
export async function listFailures(db: Db, now: Date) {
  const since = new Date(now.getTime() - 7 * DAY_MS);
  const [alerts, rebalances] = await Promise.all([
    db
      .select({
        id: agentAlerts.id,
        pool: agentAlerts.poolAddress,
        label: sql<
          string | null
        >`(select ${agentPools.label} from ${agentPools} where ${agentPools.agentId} = ${agentAlerts.agentId} and ${agentPools.poolAddress} = ${agentAlerts.poolAddress})`,
        error: agentAlerts.error,
        at: agentAlerts.at,
      })
      .from(agentAlerts)
      .where(and(isNotNull(agentAlerts.error), gte(agentAlerts.at, since)))
      .orderBy(desc(agentAlerts.at))
      .limit(50),
    db
      .select({
        id: agentRebalances.id,
        pool: agentRebalances.poolAddress,
        action: agentRebalances.action,
        label: sql<
          string | null
        >`(select ${agentPools.label} from ${agentPools} where ${agentPools.agentId} = ${agentRebalances.agentId} and ${agentPools.poolAddress} = ${agentRebalances.poolAddress})`,
        txError: agentRebalances.txError,
        error: agentRebalances.error,
        at: agentRebalances.at,
      })
      .from(agentRebalances)
      .where(
        and(or(isNotNull(agentRebalances.txError), isNotNull(agentRebalances.error)), gte(agentRebalances.at, since)),
      )
      .orderBy(desc(agentRebalances.at))
      .limit(50),
  ]);
  return [
    ...alerts.map((a) => ({
      id: a.id,
      source: "alert" as const,
      kind: "Alert",
      name: a.label ?? short(a.pool),
      error: redact(a.error ?? ""),
      at: a.at,
    })),
    ...rebalances.map((r) => ({
      id: r.id,
      source: "transaction" as const,
      kind: r.action === "claim" ? "Fee claim" : "Rebalance",
      name: r.label ?? short(r.pool),
      error: redact(r.txError ?? r.error ?? ""),
      at: r.at,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 50);
}

// --- audit ------------------------------------------------------------------------------------

export async function listAudit(db: Db, page: number) {
  const [rows, [total]] = await Promise.all([
    db
      .select({
        id: adminAudit.id,
        actorEmail: adminAudit.actorEmail,
        action: adminAudit.action,
        targetType: adminAudit.targetType,
        targetLabel: adminAudit.targetLabel,
        details: adminAudit.details,
        at: adminAudit.at,
      })
      .from(adminAudit)
      .orderBy(desc(adminAudit.at))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(adminAudit),
  ]);
  return { total: total?.n ?? 0, rows };
}
