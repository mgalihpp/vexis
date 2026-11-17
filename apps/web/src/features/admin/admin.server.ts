import {
  type Actor,
  agentOverview,
  createInviteAudited,
  disableOfficeAudited,
  enableOfficeAudited,
  extendInviteAudited,
  inviteOverview,
  inviteRequestAudited,
  listAudit,
  listFailures,
  listInviteRequests,
  listInvites,
  listOffices,
  listPausedAgents,
  listUsers,
  officeOverview,
  resumeAllAudited,
  revokeInviteAudited,
  setOfficeCapAudited,
  setUserRoleAudited,
  stopAllAudited,
  tabCounts,
  undoInviteRequest,
  userOverview,
} from "@vexis/db/admin-queries";
import { getDb } from "@vexis/db/client";
import { inviteEmail } from "@vexis/db/emails";
import { listHeartbeats } from "@vexis/db/heartbeat-queries";
import { type CreateInvite, type Role, redact } from "@vexis/shared/admin";
import { BACKGROUND_RESERVE, processBudget } from "@vexis/shared/datapi-budget";
import { SCHEDULES } from "@vexis/shared/heartbeat";
import { sendMail } from "@vexis/shared/mail";
import { trackerUsage } from "@/features/analytics/traders.server";
import { limited } from "./admin.middleware";

const db = () => getDb();

// --- heartbeats ------------------------------------------------------------------------------

/** Every schedule the runtimes write a heartbeat for; a schedule with no row yet has null times. */
async function schedules(now: number) {
  const rows = new Map((await listHeartbeats(db())).map((r) => [r.name, r]));
  return Object.entries(SCHEDULES).map(([name, spec]) => {
    const row = rows.get(name);
    const lastTickAt = row?.lastTickAt?.getTime() ?? null;
    return {
      name,
      runtime: spec.runtime,
      lastTickAt,
      stale: lastTickAt !== null && now - lastTickAt > spec.staleMs,
      lastError: row?.lastError ? redact(row.lastError, 300) : null,
      lastErrorAt: row?.lastErrorAt?.getTime() ?? null,
    };
  });
}

export async function loadCounts() {
  const now = Date.now();
  const [counts, beats] = await Promise.all([tabCounts(db()), schedules(now)]);
  return { ...counts, stale: beats.filter((b) => b.stale).length };
}

export async function loadSystem() {
  const now = Date.now();
  const [beats, tracker] = await Promise.all([schedules(now), trackerUsage()]);
  const remaining = processBudget.remaining;
  return {
    now,
    schedules: beats,
    // This web process's own reading of the shared datapi limit; unknown until it has made a request.
    datapi: Number.isFinite(remaining) ? { remaining, reserve: BACKGROUND_RESERVE, limit: 300 } : null,
    tracker,
  };
}

export async function loadAudit(page: number) {
  const { total, rows } = await listAudit(db(), page);
  return { total, rows: rows.map(({ details: _details, ...r }) => r) };
}

// --- invites ---------------------------------------------------------------------------------

export async function loadInvites(q: Parameters<typeof listInvites>[1]) {
  const now = new Date();
  const [overview, list, requests] = await Promise.all([
    inviteOverview(db(), now),
    listInvites(db(), q, now),
    listInviteRequests(db()),
  ]);
  return { now: now.getTime(), overview, ...list, requests };
}

const origin = () => process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
const linkFor = (token: string) => `${origin()}/login?invite=${token}`;

async function mailInvite(to: string, token: string, expiresAt: Date) {
  try {
    await sendMail({ to, ...inviteEmail({ link: linkFor(token), code: token, expiresAt }) });
    return true;
  } catch (error) {
    console.error("[admin] invite mail failed", error instanceof Error ? error.name : "error");
    return false;
  }
}

const INVITE_LIMIT = { max: 20, windowMs: 3_600_000 };

export async function createInvite(actor: Actor, input: CreateInvite) {
  if (limited(`invite:${actor.id}`, INVITE_LIMIT)) return { ok: false as const, error: "rate-limited" as const };
  const { token, invite } = await createInviteAudited(db(), actor, input, new Date());
  const emailed = input.send && invite.email ? await mailInvite(invite.email, token, invite.expiresAt) : false;
  return {
    ok: true as const,
    link: linkFor(token),
    emailed,
    email: invite.email,
    days: input.days,
    uses: invite.maxUses,
    sendFailed: input.send && !emailed,
  };
}

export async function sendRequest(actor: Actor, email: string) {
  if (limited(`invite:${actor.id}`, INVITE_LIMIT)) return { ok: false as const, error: "rate-limited" as const };
  const sent = await inviteRequestAudited(db(), actor, email, new Date());
  if (!sent) return { ok: false as const, error: "answered" as const };
  if (!sent.invite.email || !(await mailInvite(sent.invite.email, sent.token, sent.invite.expiresAt))) {
    await undoInviteRequest(db(), actor, sent.invite.id);
    return { ok: false as const, error: "mail" as const };
  }
  return { ok: true as const };
}

export const revokeInvite = (actor: Actor, id: string) => revokeInviteAudited(db(), actor, id);
export const extendInvite = (actor: Actor, id: string) => extendInviteAudited(db(), actor, id, new Date());

// --- users -----------------------------------------------------------------------------------

export async function loadUsers(q: Parameters<typeof listUsers>[1], viewerId: string) {
  const now = new Date();
  const [overview, list] = await Promise.all([userOverview(db(), now), listUsers(db(), q)]);
  return { overview, total: list.total, rows: list.rows.map((r) => ({ ...r, self: r.id === viewerId })) };
}

export const changeRole = (actor: Actor, userId: string, to: Role) => setUserRoleAudited(db(), actor, userId, to);

// --- offices ---------------------------------------------------------------------------------

export async function loadOffices(q: Parameters<typeof listOffices>[1]) {
  const now = new Date();
  const [overview, rows] = await Promise.all([officeOverview(db(), now), listOffices(db(), q, now)]);
  return { overview, rows };
}

export const enableOffice = (actor: Actor, email: string, usd: number) => enableOfficeAudited(db(), actor, email, usd);
export const disableOffice = (actor: Actor, userId: string) => disableOfficeAudited(db(), actor, userId);
export const setOfficeCap = (actor: Actor, userId: string, usd: number) =>
  setOfficeCapAudited(db(), actor, userId, usd);
export const stopAll = (actor: Actor) => stopAllAudited(db(), actor);
export const resumeAll = (actor: Actor) => resumeAllAudited(db(), actor);

// --- agents ----------------------------------------------------------------------------------

export async function loadAgents() {
  const now = new Date();
  const [overview, paused, failures] = await Promise.all([
    agentOverview(db(), now),
    listPausedAgents(db()),
    listFailures(db(), now),
  ]);
  return { now: now.getTime(), overview, paused, failures };
}
