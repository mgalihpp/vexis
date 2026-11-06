import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { type AgentKind, defaultAgentConfig, parseAgentConfig } from "./agents.ts";
import type { Db } from "./client.server.ts";
import {
  agentAlerts,
  agentPools,
  agentRebalances,
  agents,
  inviteRedemptions,
  invites,
  rebalanceWallets,
  telegramLinks,
  userSettings,
  wallets,
} from "./schema.ts";

// Every helper for user-owned data takes the caller's `userId` and filters by it. Callers get the
// id from the session, never from request input. Global data (pool_minutes) has no scope.

/** The shared client or an open transaction. */
export type Executor = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type UserScope = { db: Executor; userId: string };

export function forUser(db: Executor, userId: string): UserScope {
  if (!userId) throw new Error("forUser: userId is required");
  return { db, userId };
}

// --- settings ---------------------------------------------------------------------------------

export async function getSettings({ db, userId }: UserScope) {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  return row ?? { userId, timezone: "UTC", currency: "usd" as const, updatedAt: null };
}

export async function updateSettings(
  { db, userId }: UserScope,
  patch: Partial<Pick<typeof userSettings.$inferInsert, "timezone" | "currency">>,
) {
  const [row] = await db
    .insert(userSettings)
    .values({ userId, ...patch })
    .onConflictDoUpdate({ target: userSettings.userId, set: { ...patch, updatedAt: new Date() } })
    .returning();
  return row;
}

// --- wallets ----------------------------------------------------------------------------------

export function listWallets({ db, userId }: UserScope) {
  return db.select().from(wallets).where(eq(wallets.userId, userId)).orderBy(wallets.createdAt);
}

export async function addWallet({ db, userId }: UserScope, address: string, label?: string) {
  const [row] = await db
    .insert(wallets)
    .values({ userId, address, label })
    .onConflictDoUpdate({
      target: [wallets.userId, wallets.address],
      set: { label: sql`coalesce(excluded.label, ${wallets.label})` },
    })
    .returning();
  return row;
}

export async function removeWallet({ db, userId }: UserScope, walletId: string) {
  const rows = await db
    .delete(wallets)
    .where(and(eq(wallets.id, walletId), eq(wallets.userId, userId)))
    .returning({ id: wallets.id });
  return rows.length > 0;
}

// --- agents ---------------------------------------------------------------------------------

/** The user's agents, oldest first; only those of `kind` when given. */
export function listAgents({ db, userId }: UserScope, kind?: AgentKind) {
  return db
    .select()
    .from(agents)
    .where(and(eq(agents.userId, userId), kind ? eq(agents.kind, kind) : undefined))
    .orderBy(agents.createdAt, agents.id);
}

export async function getAgent({ db, userId }: UserScope, agentId: string) {
  const [row] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)));
  return row;
}

/** Inserts a new agent. A second volume-watch agent for the user fails on `agents_user_volume_watch_unique`. */
export async function insertAgent(
  { db, userId }: UserScope,
  kind: AgentKind,
  patch: { enabled?: boolean; config?: unknown } = {},
) {
  const [row] = await db
    .insert(agents)
    .values({
      userId,
      kind,
      enabled: patch.enabled ?? false,
      config: patch.config === undefined ? defaultAgentConfig(kind) : parseAgentConfig(kind, patch.config),
    })
    .returning();
  if (!row) throw new Error(`insertAgent: ${kind} not inserted`);
  return row;
}

/** Undefined when the agent is not the user's. A `config` is validated against the agent's own kind. */
export async function updateAgent(
  { db, userId }: UserScope,
  agentId: string,
  patch: { enabled?: boolean; paused?: boolean; pausedReason?: string | null; config?: unknown },
) {
  const { config, ...rest } = patch;
  const agent = config === undefined ? undefined : await getAgent({ db, userId }, agentId);
  if (config !== undefined && !agent) return undefined;
  const [row] = await db
    .update(agents)
    .set({ ...rest, ...(agent ? { config: parseAgentConfig(agent.kind, config) } : {}) })
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .returning();
  return row;
}

/** Deletes the agent with its pools and history (cascade). False when it is not the user's. */
export async function deleteAgent({ db, userId }: UserScope, agentId: string) {
  const rows = await db
    .delete(agents)
    .where(and(eq(agents.id, agentId), eq(agents.userId, userId)))
    .returning({ id: agents.id });
  return rows.length > 0;
}

/** Resumes every agent of `kind` the runner paused for one of `reasons`. A pause the user chose has no reason and stays. */
export async function resumeAgentsPausedFor({ db, userId }: UserScope, kind: AgentKind, reasons: readonly string[]) {
  if (reasons.length === 0) return;
  await db
    .update(agents)
    .set({ paused: false, pausedReason: null })
    .where(
      and(
        eq(agents.userId, userId),
        eq(agents.kind, kind),
        eq(agents.paused, true),
        inArray(agents.pausedReason, [...reasons]),
      ),
    );
}

/** Serializes agent creation per user inside a transaction, so two creates cannot both pass a uniqueness check. */
export async function lockUserAgents({ db, userId }: UserScope) {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`agents:${userId}`}))`);
}

// --- agent pools ------------------------------------------------------------------------------

export function listAgentPools({ db, userId }: UserScope, agentId: string) {
  return db
    .select()
    .from(agentPools)
    .where(and(eq(agentPools.userId, userId), eq(agentPools.agentId, agentId)))
    .orderBy(agentPools.createdAt);
}

/** The composite FK rejects an `agentId` that belongs to another user. */
export async function addAgentPool({ db, userId }: UserScope, agentId: string, poolAddress: string, label?: string) {
  const [row] = await db
    .insert(agentPools)
    .values({ userId, agentId, poolAddress, label })
    .onConflictDoUpdate({
      target: [agentPools.agentId, agentPools.poolAddress],
      set: { label: sql`coalesce(excluded.label, ${agentPools.label})` },
    })
    .returning();
  return row;
}

/** Every pool of the user's agents of `kind`, with the agent that runs on it. */
export function listPoolsOfKind({ db, userId }: UserScope, kind: AgentKind) {
  return db
    .select({ agentId: agentPools.agentId, poolAddress: agentPools.poolAddress })
    .from(agentPools)
    .innerJoin(agents, and(eq(agents.id, agentPools.agentId), eq(agents.userId, agentPools.userId)))
    .where(and(eq(agentPools.userId, userId), eq(agents.kind, kind)));
}

export async function removeAgentPool({ db, userId }: UserScope, agentId: string, poolId: string) {
  const rows = await db
    .delete(agentPools)
    .where(and(eq(agentPools.id, poolId), eq(agentPools.agentId, agentId), eq(agentPools.userId, userId)))
    .returning({ id: agentPools.id });
  return rows.length > 0;
}

// --- agent alerts -----------------------------------------------------------------------------

export function listAlerts({ db, userId }: UserScope, options: { limit?: number; before?: Date } = {}) {
  const conditions = [eq(agentAlerts.userId, userId)];
  if (options.before) conditions.push(lt(agentAlerts.at, options.before));
  return db
    .select()
    .from(agentAlerts)
    .where(and(...conditions))
    .orderBy(desc(agentAlerts.at))
    .limit(Math.min(options.limit ?? 50, 500));
}

export async function getAlert({ db, userId }: UserScope, alertId: string) {
  const [row] = await db
    .select()
    .from(agentAlerts)
    .where(and(eq(agentAlerts.id, alertId), eq(agentAlerts.userId, userId)));
  return row;
}

// --- auto-rebalance --------------------------------------------------------------------------

export function listRebalances({ db, userId }: UserScope, options: { limit?: number; agentId?: string } = {}) {
  return db
    .select()
    .from(agentRebalances)
    .where(
      and(
        eq(agentRebalances.userId, userId),
        options.agentId ? eq(agentRebalances.agentId, options.agentId) : undefined,
      ),
    )
    .orderBy(desc(agentRebalances.at))
    .limit(Math.min(options.limit ?? 50, 500));
}

/**
 * The public key and the encrypted RPC URL (the web app shows only its host). The encrypted secret is read by the
 * runner, never by the web app.
 */
export function getRebalanceWallet({ db, userId }: UserScope) {
  return db
    .select({ publicKey: rebalanceWallets.publicKey, rpcUrl: rebalanceWallets.rpcUrl })
    .from(rebalanceWallets)
    .where(eq(rebalanceWallets.userId, userId))
    .then((rows) => rows[0]);
}

/** Saves or replaces the wallet. Secret and RPC URL arrive encrypted. */
export async function saveRebalanceWallet(
  { db, userId }: UserScope,
  wallet: { publicKey: string; encryptedSecret: string; encryptedRpcUrl: string },
) {
  const row = { publicKey: wallet.publicKey, secretKey: wallet.encryptedSecret, rpcUrl: wallet.encryptedRpcUrl };
  await db
    .insert(rebalanceWallets)
    .values({ userId, ...row })
    .onConflictDoUpdate({ target: rebalanceWallets.userId, set: row });
}

/** Replaces only the RPC URL (encrypted). False when the user has no wallet saved. */
export async function saveRebalanceRpcUrl({ db, userId }: UserScope, encryptedRpcUrl: string) {
  const rows = await db
    .update(rebalanceWallets)
    .set({ rpcUrl: encryptedRpcUrl })
    .where(eq(rebalanceWallets.userId, userId))
    .returning({ userId: rebalanceWallets.userId });
  return rows.length > 0;
}

export async function removeRebalanceWallet({ db, userId }: UserScope) {
  await db.delete(rebalanceWallets).where(eq(rebalanceWallets.userId, userId));
}

// --- telegram ---------------------------------------------------------------------------------

/** Every Telegram link the user has, one per agent kind at most. */
export function getTelegramLinks({ db, userId }: UserScope) {
  return db.select().from(telegramLinks).where(eq(telegramLinks.userId, userId));
}

export function getTelegramLink({ db, userId }: UserScope, kind: AgentKind) {
  return db
    .select()
    .from(telegramLinks)
    .where(and(eq(telegramLinks.userId, userId), eq(telegramLinks.kind, kind)))
    .then((rows) => rows[0]);
}

/** Stores the kind's bot (token already encrypted). Any earlier chat is dropped: it belonged to another bot. */
export async function saveOwnBot(
  { db, userId }: UserScope,
  kind: AgentKind,
  encryptedToken: string,
  botUsername: string,
) {
  const fresh = { botToken: encryptedToken, botUsername, chatId: null, username: null, linkedAt: null };
  await db
    .insert(telegramLinks)
    .values({ userId, kind, ...fresh })
    .onConflictDoUpdate({ target: [telegramLinks.userId, telegramLinks.kind], set: fresh });
}

/** Binds the chat found on the kind's bot. False when no bot is saved for that kind. */
export async function linkOwnBotChat({ db, userId }: UserScope, kind: AgentKind, chatId: bigint, username?: string) {
  const rows = await db
    .update(telegramLinks)
    .set({ chatId, username: username ?? null, linkedAt: new Date() })
    .where(and(eq(telegramLinks.userId, userId), eq(telegramLinks.kind, kind)))
    .returning({ userId: telegramLinks.userId });
  return rows.length > 0;
}

/** Forgets the kind's bot and chat. The runner pauses that agent at its next alert. */
export async function removeTelegramLink({ db, userId }: UserScope, kind: AgentKind) {
  await db.delete(telegramLinks).where(and(eq(telegramLinks.userId, userId), eq(telegramLinks.kind, kind)));
}

// --- invites (not user-scoped: used before the user exists, or by admins) ---------------------

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Returns the plain token once; only its hash is stored. */
export async function createInvite(
  db: Db,
  input: { createdBy?: string; email?: string; note?: string; maxUses?: number; expiresAt: Date },
) {
  const token = randomBytes(24).toString("base64url");
  const [invite] = await db
    .insert(invites)
    .values({ ...input, tokenHash: hashInviteToken(token) })
    .returning();
  return { token, invite };
}

export async function findUsableInvite(db: Db, token: string) {
  const [row] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.tokenHash, hashInviteToken(token)),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
        lt(invites.useCount, invites.maxUses),
      ),
    );
  return row;
}

/**
 * Atomically takes one use of the invite and records the redemption. Run it in the same
 * transaction that creates the user, so a failed sign-up does not burn a use.
 * Returns false when the invite is no longer usable or bound to another email.
 */
export async function redeemInvite(db: Executor, token: string, user: { id: string; email: string }) {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .update(invites)
      .set({ useCount: sql`${invites.useCount} + 1` })
      .where(
        and(
          eq(invites.tokenHash, hashInviteToken(token)),
          isNull(invites.revokedAt),
          gt(invites.expiresAt, new Date()),
          lt(invites.useCount, invites.maxUses),
          sql`(${invites.email} is null or lower(${invites.email}) = lower(${user.email}))`,
        ),
      )
      .returning({ id: invites.id });
    if (!invite) return false;
    await tx.insert(inviteRedemptions).values({ inviteId: invite.id, usedBy: user.id });
    return true;
  });
}

export async function revokeInvite(db: Db, inviteId: string) {
  await db.update(invites).set({ revokedAt: new Date() }).where(eq(invites.id, inviteId));
}
