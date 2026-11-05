import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { type AgentKind, defaultAgentConfig, parseAgentConfig } from "./agents.ts";
import type { Db } from "./client.server.ts";
import {
  agentAlerts,
  agentPools,
  agents,
  inviteRedemptions,
  invites,
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

// --- agents -----------------------------------------------------------------------------------

export async function getAgent({ db, userId }: UserScope, kind: AgentKind) {
  const [row] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.userId, userId), eq(agents.kind, kind)));
  return row;
}

/** Creates the user's agent of this kind with the default config if it does not exist yet. */
export async function ensureAgent({ db, userId }: UserScope, kind: AgentKind) {
  await db
    .insert(agents)
    .values({ userId, kind, config: defaultAgentConfig(kind) })
    .onConflictDoNothing({ target: [agents.userId, agents.kind] });
  const row = await getAgent({ db, userId }, kind);
  if (!row) throw new Error(`ensureAgent: ${kind} missing after insert`);
  return row;
}

export async function updateAgent(
  { db, userId }: UserScope,
  kind: AgentKind,
  patch: { enabled?: boolean; paused?: boolean; pausedReason?: string | null; config?: unknown },
) {
  const { config, ...rest } = patch;
  const [row] = await db
    .update(agents)
    .set({ ...rest, ...(config === undefined ? {} : { config: parseAgentConfig(kind, config) }) })
    .where(and(eq(agents.userId, userId), eq(agents.kind, kind)))
    .returning();
  return row;
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

export async function removeAgentPool({ db, userId }: UserScope, poolId: string) {
  const rows = await db
    .delete(agentPools)
    .where(and(eq(agentPools.id, poolId), eq(agentPools.userId, userId)))
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

// --- telegram ---------------------------------------------------------------------------------

export function getTelegramLink({ db, userId }: UserScope) {
  return db
    .select()
    .from(telegramLinks)
    .where(eq(telegramLinks.userId, userId))
    .then((rows) => rows[0]);
}

/** Starts (or restarts) linking: a fresh one-time code the user sends to the bot. */
export async function createTelegramLinkCode({ db, userId }: UserScope, ttlMs = 10 * 60_000) {
  const linkCode = randomBytes(6).toString("base64url");
  const linkCodeExpiresAt = new Date(Date.now() + ttlMs);
  await db
    .insert(telegramLinks)
    .values({ userId, linkCode, linkCodeExpiresAt })
    .onConflictDoUpdate({
      target: telegramLinks.userId,
      set: {
        linkCode,
        linkCodeExpiresAt,
        // Back to the shared bot. A chat that belonged to the user's own bot is no use there, so it goes.
        chatId: sql`case when ${telegramLinks.botToken} is not null then null else ${telegramLinks.chatId} end`,
        linkedAt: sql`case when ${telegramLinks.botToken} is not null then null else ${telegramLinks.linkedAt} end`,
        botToken: null,
        botUsername: null,
      },
    });
  return { linkCode, expiresAt: linkCodeExpiresAt };
}

/** Stores the user's own bot (token already encrypted). Any earlier chat is dropped: it belonged to another bot. */
export async function saveOwnBot({ db, userId }: UserScope, encryptedToken: string, botUsername: string) {
  const fresh = {
    botToken: encryptedToken,
    botUsername,
    chatId: null,
    username: null,
    linkedAt: null,
    linkCode: null,
    linkCodeExpiresAt: null,
  };
  await db
    .insert(telegramLinks)
    .values({ userId, ...fresh })
    .onConflictDoUpdate({ target: telegramLinks.userId, set: fresh });
}

/** Binds the chat found on the user's own bot. False when the user has no bot saved. */
export async function linkOwnBotChat({ db, userId }: UserScope, chatId: bigint, username?: string) {
  const rows = await db
    .update(telegramLinks)
    .set({ chatId, username: username ?? null, linkedAt: new Date() })
    .where(and(eq(telegramLinks.userId, userId), sql`${telegramLinks.botToken} is not null`))
    .returning({ userId: telegramLinks.userId });
  return rows.length > 0;
}

/** Forgets the chat, the code and the bot. The runner pauses the user's agents at the next alert. */
export async function removeTelegramLink({ db, userId }: UserScope) {
  await db.delete(telegramLinks).where(eq(telegramLinks.userId, userId));
}

/**
 * Called by the bot (not user-scoped: the code is the proof). Consumes the code and binds the chat.
 * Returns the linked user id, or undefined for an unknown or expired code.
 */
export async function redeemTelegramLinkCode(db: Db, code: string, chatId: bigint, username?: string) {
  const [row] = await db
    .update(telegramLinks)
    .set({ chatId, username, linkedAt: new Date(), linkCode: null, linkCodeExpiresAt: null })
    .where(and(eq(telegramLinks.linkCode, code), gt(telegramLinks.linkCodeExpiresAt, new Date())))
    .returning({ userId: telegramLinks.userId });
  return row?.userId;
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
