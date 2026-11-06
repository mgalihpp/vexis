import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { AGENT_KINDS, type AgentKind } from "./agents.ts";

// Two kinds of tables live here:
//
// - User-owned tables carry `user_id` (FK to users, indexed, ON DELETE CASCADE). The app never
//   reads them directly; it goes through `queries.server.ts`, where every helper takes the
//   caller's user id and filters by it.
// - Global tables (`pool_minutes`) hold market data. A pool is the same pool for everyone, so it
//   is fetched once per minute and stored once, however many users watch it.
//
// Every table has RLS enabled with no policies. The server connects as `postgres`, which bypasses
// RLS, so this only shuts the Supabase Data API (anon / authenticated keys) out of every table.

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

const userId = () =>
  text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" });

// ---------------------------------------------------------------------------------------------
// Auth. Column names follow Better Auth's core schema (user, session, account, verification) so
// Better Auth's Drizzle adapter can use these tables as they are; nothing here depends on it.
// Ids are text so the auth library can generate them.
// ---------------------------------------------------------------------------------------------

export const USER_ROLES = ["admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    /** Admins can create invites. */
    role: text("role").$type<UserRole>().notNull().default("member"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check("users_role_check", sql`${t.role} in ('admin', 'member')`)],
).enableRLS();

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: userId(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
).enableRLS();

/** Login methods per user (password hash, OAuth tokens, Telegram login, ...). */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: userId(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    unique("accounts_provider_account_unique").on(t.providerId, t.accountId),
  ],
).enableRLS();

/** Short-lived tokens (email verification, password reset, magic links). */
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
).enableRLS();

/**
 * Sign-up is invite-only. Only the SHA-256 of the token is stored (`hashInviteToken`), so a
 * database leak does not leak usable invites; the creator sees the token once.
 * An invite is usable while `revoked_at` is null, `expires_at` is in the future and
 * `use_count < max_uses`. If `email` is set, only that address may redeem it.
 */
export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    email: text("email"),
    note: text("note"),
    maxUses: integer("max_uses").notNull().default(1),
    useCount: integer("use_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("invites_created_by_idx").on(t.createdBy),
    check("invites_uses_check", sql`${t.maxUses} >= 1 and ${t.useCount} >= 0 and ${t.useCount} <= ${t.maxUses}`),
  ],
).enableRLS();

/** One row per sign-up through an invite (`used_by` / `used_at`). A user redeems one invite. */
export const inviteRedemptions = pgTable(
  "invite_redemptions",
  {
    inviteId: uuid("invite_id")
      .notNull()
      .references(() => invites.id, { onDelete: "cascade" }),
    usedBy: text("used_by")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.inviteId, t.usedBy] })],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// User-owned data.
// ---------------------------------------------------------------------------------------------

export const CURRENCIES = ["usd", "sol"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const userSettings = pgTable(
  "user_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** IANA zone used for day boundaries, ranges and timestamps. */
    timezone: text("timezone").notNull().default("UTC"),
    currency: text("currency").$type<Currency>().notNull().default("usd"),
    updatedAt: updatedAt(),
  },
  (t) => [check("user_settings_currency_check", sql`${t.currency} in ('usd', 'sol')`)],
).enableRLS();

/** Wallets a user tracks in Portfolio. Two users may track the same address independently. */
export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    address: text("address").notNull(),
    label: text("label"),
    createdAt: createdAt(),
  },
  (t) => [index("wallets_user_id_idx").on(t.userId), unique("wallets_user_address_unique").on(t.userId, t.address)],
).enableRLS();

/**
 * A user's Telegram setup. There is no shared bot: the user brings their own (`bot_token`, AES-GCM encrypted,
 * see `secret.ts`). The web app validates it with `getMe`, then reads `chat_id` from the messages waiting on
 * that bot once the user has sent /start. The runner sends alerts with this token. One chat per user and one
 * user per chat, so alerts never reach someone else's chat.
 */
export const telegramLinks = pgTable("telegram_links", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  botToken: text("bot_token").notNull(),
  botUsername: text("bot_username").notNull(),
  chatId: bigint("chat_id", { mode: "bigint" }).unique(),
  username: text("username"),
  linkedAt: timestamp("linked_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

/**
 * One row per user per agent kind. The runner runs rows where `enabled and not paused`.
 * `config` matches `AGENT_CONFIG[kind]` (zod) and is validated on every write and read.
 * `enabled` is the user's switch; `paused` is set by the user or the runner (for example while the
 * Telegram link is missing) without losing the enabled choice.
 */
export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    kind: text("kind").$type<AgentKind>().notNull(),
    enabled: boolean("enabled").notNull().default(false),
    paused: boolean("paused").notNull().default(false),
    pausedReason: text("paused_reason"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("agents_user_id_idx").on(t.userId),
    unique("agents_user_kind_unique").on(t.userId, t.kind),
    // Target for the composite FKs below, so a child row's user_id always equals its agent's.
    unique("agents_id_user_unique").on(t.id, t.userId),
    index("agents_runnable_idx").on(t.kind).where(sql`${t.enabled} and not ${t.paused}`),
    check("agents_kind_check", sql.raw(`kind in (${AGENT_KINDS.map((k) => `'${k}'`).join(", ")})`)),
  ],
).enableRLS();

/**
 * Pools a user's agent watches. `user_id` is copied from the agent (enforced by the composite FK)
 * so every read can be scoped by user without a join. `last_alert_at` backs the per-pool cooldown.
 */
export const agentPools = pgTable(
  "agent_pools",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    userId: userId(),
    poolAddress: text("pool_address").notNull(),
    label: text("label"),
    lastAlertAt: timestamp("last_alert_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.agentId, t.userId], foreignColumns: [agents.id, agents.userId] }).onDelete("cascade"),
    index("agent_pools_user_id_idx").on(t.userId),
    // The runner collects the distinct watched pools across all users from this index.
    index("agent_pools_pool_address_idx").on(t.poolAddress),
    unique("agent_pools_agent_pool_unique").on(t.agentId, t.poolAddress),
  ],
).enableRLS();

/** Alert history, written by the runner. `delivered` / `error` record the Telegram send. */
export const agentAlerts = pgTable(
  "agent_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    userId: userId(),
    poolAddress: text("pool_address").notNull(),
    /** USD volume in the minute that triggered the alert. */
    vol1m: doublePrecision("vol_1m").notNull(),
    /** Median of the baseline window at the time. */
    baseline: doublePrecision("baseline").notNull(),
    /** vol1m / baseline. */
    ratio: doublePrecision("ratio").notNull(),
    delivered: boolean("delivered").notNull().default(false),
    error: text("error"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.agentId, t.userId], foreignColumns: [agents.id, agents.userId] }).onDelete("cascade"),
    index("agent_alerts_user_at_idx").on(t.userId, t.at.desc()),
  ],
).enableRLS();

/**
 * The wallet the user's auto-rebalance agent manages: a hot wallet the user hands us, one per user. The
 * secret key is AES-256-GCM encrypted with `WALLET_ENC_KEY` (`secret.ts`) and never leaves the server;
 * the public key is kept in the clear so reads and previews never decrypt it.
 */
export const rebalanceWallets = pgTable("rebalance_wallets", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(),
  secretKey: text("secret_key").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

/**
 * Rebalance history, written by the runner: the range the position left, the range it would move to,
 * and the outcome. `signature` is null for a preview. `delivered` / `error` record the Telegram send.
 */
export const agentRebalances = pgTable(
  "agent_rebalances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(),
    userId: userId(),
    poolAddress: text("pool_address").notNull(),
    positionAddress: text("position_address").notNull(),
    activeBin: integer("active_bin").notNull(),
    lowerBin: integer("lower_bin").notNull(),
    upperBin: integer("upper_bin").notNull(),
    newLowerBin: integer("new_lower_bin").notNull(),
    newUpperBin: integer("new_upper_bin").notNull(),
    signature: text("signature"),
    delivered: boolean("delivered").notNull().default(false),
    error: text("error"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.agentId, t.userId], foreignColumns: [agents.id, agents.userId] }).onDelete("cascade"),
    index("agent_rebalances_user_at_idx").on(t.userId, t.at.desc()),
  ],
).enableRLS();

// ---------------------------------------------------------------------------------------------
// Global market data, shared by every user.
// ---------------------------------------------------------------------------------------------

/**
 * Per-minute volume per pool, from the delta of Meteora's `cumulative_metrics.volume`. Shared:
 * the runner polls each watched pool once per minute no matter how many users watch it, and every
 * user's volume-watch reads the same rows for its baseline. No user_id on purpose.
 */
export const poolMinutes = pgTable(
  "pool_minutes",
  {
    poolAddress: text("pool_address").notNull(),
    /** Start of the minute, UTC. */
    minute: timestamp("minute", { withTimezone: true }).notNull(),
    cumulativeVolume: doublePrecision("cumulative_volume").notNull(),
    /** USD volume since the previous reading; null for a pool's first reading. */
    volume: doublePrecision("volume"),
    tvl: doublePrecision("tvl"),
  },
  (t) => [primaryKey({ columns: [t.poolAddress, t.minute] })],
).enableRLS();
