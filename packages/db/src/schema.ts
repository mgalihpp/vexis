import {
  AGENT_KINDS,
  type AgentKind,
  REBALANCE_ACTIONS,
  type RebalanceAction,
  TELEGRAM_KINDS,
  type TelegramKind,
} from "@vexis/shared/agents";
import {
  type Decider,
  KEY_SOURCES,
  type KeySource,
  LLM_AGENTS,
  LLM_PROVIDERS,
  type LlmAgent,
  type LlmProvider,
  type MessageTone,
  OFFICE_AGENTS,
  OFFICE_MODES,
  type OfficeAgent,
  type OfficeMode,
  OPEN_STATUSES,
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
  PROPOSERS,
  type ProposalKind,
  type ProposalStatus,
  type Proposer,
  WALLET_SOURCES,
  type WalletSource,
} from "@vexis/shared/office";
import { PRESETS, type PresetChoice } from "@vexis/shared/screen";
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
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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

/**
 * An email that asked for an invite on the landing page. `invited_at` is set once an admin
 * mails it an invite (`db:invite --email … --send`).
 */
export const inviteRequests = pgTable("invite_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: createdAt(),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  inviteId: uuid("invite_id").references(() => invites.id, { onDelete: "set null" }),
}).enableRLS();

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
 * A user's Telegram setup, one per agent kind and one for the office. There is no shared bot: the user brings their
 * own (`bot_token`, AES-GCM encrypted, see `secret.ts`). The web app validates it with `getMe`, then reads `chat_id`
 * from the messages waiting on that bot once the user has sent /start. The runner sends that kind's alerts with this
 * token; the office runtime sends approval cards and polls the office bot for button presses once a chat is linked.
 * A chat is linked to one user per kind, so alerts never reach someone else's chat.
 */
export const telegramLinks = pgTable(
  "telegram_links",
  {
    userId: userId(),
    kind: text("kind").$type<TelegramKind>().notNull(),
    botToken: text("bot_token").notNull(),
    botUsername: text("bot_username").notNull(),
    chatId: bigint("chat_id", { mode: "bigint" }),
    username: text("username"),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    /** Next `getUpdates` offset for a bot something polls (the office's); null until its first update. */
    updateOffset: bigint("update_offset", { mode: "number" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.kind] }),
    unique("telegram_links_kind_chat_unique").on(t.kind, t.chatId),
    check("telegram_links_kind_check", sql.raw(`kind in (${TELEGRAM_KINDS.map((k) => `'${k}'`).join(", ")})`)),
  ],
).enableRLS();

/**
 * A user's agents: at most one `volume-watch` (it watches up to 20 pools), and any number of `auto-rebalance` agents,
 * each with exactly one pool. The runner runs rows where `enabled and not paused`.
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
    uniqueIndex("agents_user_volume_watch_unique").on(t.userId, t.kind).where(sql`${t.kind} = 'volume-watch'`),
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
 * The wallet the user's auto-rebalance agents manage: a hot wallet the user hands us, one per user. The secret key
 * is a sealed box (`v2`, `secret.ts`): the web app seals it to `WALLET_PUBLIC_KEY` and only the runner can open it.
 * The RPC URL (which usually carries an API key) is AES-256-GCM encrypted with `RPC_ENC_KEY`, which the runner and
 * the office runtime read. The public key and the RPC's host (`rpc_host`, no path or key) are kept in the clear, so
 * the web app shows the wallet without decrypting anything. Rows saved before the sealed box hold `v1` values under
 * `WALLET_ENC_KEY` until `db:rewrap`. `rpc_url` is null on rows saved before it was required; the runner skips
 * those until the user adds one.
 */
export const rebalanceWallets = pgTable("rebalance_wallets", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(),
  secretKey: text("secret_key").notNull(),
  rpcUrl: text("rpc_url"),
  rpcHost: text("rpc_host"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();

/**
 * Rebalance history, written by the runner: the range the position left, the range it moves to, and the
 * outcome. A `claim` row is an in-range fee claim: both ranges are the current one and `fee_sol` is what the
 * fees were worth when the runner decided to claim. `live` rows were sent on-chain: `signature` once it confirmed, `tx_error` when it failed, neither
 * while in flight (or if the runner died mid-send). A preview has `live` false and no signature.
 * `delivered` / `error` record the Telegram send.
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
    action: text("action").$type<RebalanceAction>().notNull().default("rebalance"),
    /** Unclaimed fees valued in SOL at the active bin price; null when the pool has no SOL side or it was not read. */
    feeSol: doublePrecision("fee_sol"),
    live: boolean("live").notNull().default(false),
    signature: text("signature"),
    txError: text("tx_error"),
    delivered: boolean("delivered").notNull().default(false),
    error: text("error"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({ columns: [t.agentId, t.userId], foreignColumns: [agents.id, agents.userId] }).onDelete("cascade"),
    index("agent_rebalances_user_at_idx").on(t.userId, t.at.desc()),
    check("agent_rebalances_action_check", sql.raw(`action in (${REBALANCE_ACTIONS.map((a) => `'${a}'`).join(", ")})`)),
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

// ---------------------------------------------------------------------------------------------
// The virtual office (`apps/office`, `/office`). One office per user, enabled by an admin (`db:office`).
// ---------------------------------------------------------------------------------------------

const enumCheck = (name: string, column: string, values: readonly string[]) =>
  check(name, sql.raw(`${column} in (${values.map((v) => `'${v}'`).join(", ")})`));

const openStatus = sql.raw(`status in (${OPEN_STATUSES.map((s) => `'${s}'`).join(", ")})`);

/**
 * The office's one row; having it is what turns the office on. `guardrails` and `models` are jsonb parsed with
 * `Guardrails` and `OfficeModels`. `llm_keys` maps a provider to the user's own API key, encrypted with
 * `TOKEN_ENC_KEY`. `wallet_source` `user` reads `rebalance_wallets`; `office` reads the office's own wallet below,
 * stored like `rebalance_wallets`. `vexis_daily_usd` is the admin's cap on Vexis-paid LLM calls (0 = none allowed).
 */
export const officeConfig = pgTable(
  "office_config",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").$type<OfficeMode>().notNull().default("approval"),
    paused: boolean("paused").notNull().default(false),
    pausedReason: text("paused_reason"),
    pausedUntil: timestamp("paused_until", { withTimezone: true }),
    /** Preview (false) simulates every approved proposal; live signs and sends it from the office's wallet. */
    live: boolean("live").notNull().default(false),
    /** The office's capital (native SOL plus real positions at cost) at the first read of `day_capital_at`'s UTC day. */
    dayCapitalSol: doublePrecision("day_capital_sol"),
    dayCapitalAt: timestamp("day_capital_at", { withTimezone: true }),
    guardrails: jsonb("guardrails").$type<Record<string, unknown>>().notNull().default({}),
    models: jsonb("models").$type<Record<string, unknown>>().notNull().default({}),
    keySource: text("key_source").$type<KeySource>().notNull().default("vexis"),
    llmKeys: jsonb("llm_keys").$type<Partial<Record<LlmProvider, string>>>().notNull().default({}),
    vexisDailyUsd: doublePrecision("vexis_daily_usd").notNull().default(0),
    walletSource: text("wallet_source").$type<WalletSource>().notNull().default("user"),
    officePublicKey: text("office_public_key"),
    officeSecretKey: text("office_secret_key"),
    officeRpcUrl: text("office_rpc_url"),
    officeRpcHost: text("office_rpc_host"),
    /** A preset id, never its filter, so tuning a preset reaches every office on it; `custom` reads `pool_filter`. */
    poolPreset: text("pool_preset").$type<PresetChoice>().notNull().default("blue-chip"),
    poolFilter: jsonb("pool_filter").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    enumCheck("office_config_mode_check", "mode", OFFICE_MODES),
    enumCheck("office_config_key_source_check", "key_source", KEY_SOURCES),
    enumCheck("office_config_wallet_source_check", "wallet_source", WALLET_SOURCES),
    enumCheck("office_config_pool_preset_check", "pool_preset", PRESETS),
  ],
).enableRLS();

/**
 * One proposed on-chain action. `status` moves only through `transition()` in `office.ts`, with the update
 * conditioned on the old status. `params` is parsed with `PROPOSAL_PARAMS[kind]`, `risk_notes` with `RiskNotes`.
 * The partial unique index keeps one unfinished proposal per pool. `simulated` rows never reach the chain (MVP).
 */
export const officeProposals = pgTable(
  "office_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    kind: text("kind").$type<ProposalKind>().notNull(),
    status: text("status").$type<ProposalStatus>().notNull().default("draft"),
    poolAddress: text("pool_address").notNull(),
    poolName: text("pool_name"),
    positionAddress: text("position_address"),
    params: jsonb("params").$type<Record<string, unknown>>().notNull(),
    rationale: text("rationale").notNull(),
    riskNotes: jsonb("risk_notes").$type<Record<string, unknown>>(),
    /** The Manager's one-paragraph summary for the approval card. */
    summary: text("summary"),
    proposedBy: text("proposed_by").$type<Proposer>().notNull(),
    runId: uuid("run_id"),
    decidedBy: text("decided_by").$type<Decider>(),
    simulated: boolean("simulated").notNull().default(true),
    signature: text("signature"),
    txError: text("tx_error"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** The approval card in the owner's office bot chat, until it is edited to show the outcome. */
    telegramMessageId: bigint("telegram_message_id", { mode: "number" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("office_proposals_user_created_idx").on(t.userId, t.createdAt.desc()),
    uniqueIndex("office_proposals_user_pool_open_unique").on(t.userId, t.poolAddress).where(openStatus),
    index("office_proposals_open_idx").on(t.status).where(openStatus),
    enumCheck("office_proposals_kind_check", "kind", PROPOSAL_KINDS),
    enumCheck("office_proposals_status_check", "status", PROPOSAL_STATUSES),
    enumCheck("office_proposals_proposed_by_check", "proposed_by", PROPOSERS),
  ],
).enableRLS();

/** The activity feed: who said what, about which pool or proposal. */
export const officeMessages = pgTable(
  "office_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    agent: text("agent").$type<OfficeAgent>().notNull(),
    text: text("text").notNull(),
    tone: text("tone").$type<MessageTone>(),
    poolAddress: text("pool_address"),
    proposalId: uuid("proposal_id").references(() => officeProposals.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("office_messages_user_at_idx").on(t.userId, t.at.desc()),
    enumCheck("office_messages_agent_check", "agent", OFFICE_AGENTS),
  ],
).enableRLS();

/** One LLM call: what it ran on, what it cost and how long it took. Never holds a prompt or a key. */
export const officeRuns = pgTable(
  "office_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    agent: text("agent").$type<LlmAgent>().notNull(),
    provider: text("provider").$type<LlmProvider>().notNull(),
    model: text("model").notNull(),
    keySource: text("key_source").$type<KeySource>().notNull(),
    promptVersion: text("prompt_version").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** Null when the call failed before the provider reported usage. */
    costUsd: doublePrecision("cost_usd"),
    durationMs: integer("duration_ms").notNull(),
    error: text("error"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("office_runs_user_at_idx").on(t.userId, t.at.desc()),
    enumCheck("office_runs_agent_check", "agent", LLM_AGENTS),
    enumCheck("office_runs_provider_check", "provider", LLM_PROVIDERS),
    enumCheck("office_runs_key_source_check", "key_source", KEY_SOURCES),
  ],
).enableRLS();

/**
 * The last exchange with each LLM desk: the two messages it was sent, the raw answer and that call's metadata. One row
 * per (user, agent), replaced on every call, so showing a thread never grows with history. A desk has no tools: one
 * system message, one user message, one JSON answer, and nothing else on the wire.
 */
export const officeThreads = pgTable(
  "office_threads",
  {
    userId: userId(),
    agent: text("agent").$type<LlmAgent>().notNull(),
    provider: text("provider").$type<LlmProvider>().notNull(),
    model: text("model").notNull(),
    keySource: text("key_source").$type<KeySource>().notNull(),
    promptVersion: text("prompt_version").notNull(),
    system: text("system").notNull(),
    userMessage: text("user_message").notNull(),
    /** The answer exactly as the provider sent it; null when the call failed before one arrived. */
    reply: text("reply"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: doublePrecision("cost_usd"),
    durationMs: integer("duration_ms").notNull(),
    error: text("error"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.agent] }),
    enumCheck("office_threads_agent_check", "agent", LLM_AGENTS),
    enumCheck("office_threads_provider_check", "provider", LLM_PROVIDERS),
    enumCheck("office_threads_key_source_check", "key_source", KEY_SOURCES),
  ],
).enableRLS();

/**
 * One row per position the office opened: why it opened, why it closed and what it made. PnL is null until the
 * Bookkeeper reads a real close from Meteora, and stays null for a simulated position nobody priced.
 */
export const officeJournal = pgTable(
  "office_journal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: userId(),
    openProposalId: uuid("open_proposal_id").references(() => officeProposals.id, { onDelete: "set null" }),
    closeProposalId: uuid("close_proposal_id").references(() => officeProposals.id, { onDelete: "set null" }),
    poolAddress: text("pool_address").notNull(),
    poolName: text("pool_name"),
    positionAddress: text("position_address"),
    /** The wallet that holds a real position, for the Bookkeeper's PnL read. */
    walletAddress: text("wallet_address"),
    simulated: boolean("simulated").notNull(),
    amountSol: doublePrecision("amount_sol").notNull(),
    amountUsd: doublePrecision("amount_usd"),
    /** The open position's last on-chain value in SOL, fees included, written by the runner's Monitor. */
    valueSol: doublePrecision("value_sol"),
    valuedAt: timestamp("valued_at", { withTimezone: true }),
    openReason: text("open_reason").notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closeReason: text("close_reason"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    pnlSol: doublePrecision("pnl_sol"),
    pnlUsd: doublePrecision("pnl_usd"),
    /** When the Bookkeeper read a real close's PnL; a PnL still null after it is unknown for good. */
    pnlCheckedAt: timestamp("pnl_checked_at", { withTimezone: true }),
  },
  (t) => [
    index("office_journal_user_opened_idx").on(t.userId, t.openedAt.desc()),
    index("office_journal_user_open_idx").on(t.userId).where(sql`${t.closedAt} is null`),
  ],
).enableRLS();

/**
 * One row per runtime schedule, written by the runner and the office runtime after each tick. Global market-style
 * data with no `user_id`; the other runtime's watchdog and the admin page read it.
 */
export const serviceHeartbeats = pgTable("service_heartbeats", {
  name: text("name").primaryKey(),
  /** The last tick that finished without error. */
  lastTickAt: timestamp("last_tick_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  /** Set while a stale alert for this schedule is open, so one outage sends one message. */
  alertedAt: timestamp("alerted_at", { withTimezone: true }),
}).enableRLS();
