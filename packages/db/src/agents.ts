import { z } from "zod";
import { PoolFilter, PRESETS, SCREENER_MAX_BASELINE } from "./screen.ts";

// Agent kinds and their config schemas. `agents.config` is jsonb; every write goes through
// `parseAgentConfig`, and the runner parses again on read so a bad row is skipped, not run.

export const AGENT_KINDS = ["volume-watch", "auto-rebalance"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export const VOLUME_SOURCES = ["pools", "screener"] as const;
export type VolumeSource = (typeof VOLUME_SOURCES)[number];

export const VolumeWatchConfig = z
  .object({
    /** Alert when vol1m >= mult × median of the last `baseline` readings. */
    mult: z.number().positive().default(3),
    /** Number of per-minute readings in the rolling median. */
    baseline: z.number().int().min(3).max(1440).default(30),
    /** Alert only when vol1m is at least this many USD. */
    minUsd: z.number().nonnegative().default(5000),
    /** Poll interval in seconds. */
    intervalSec: z.number().int().min(30).max(3600).default(60),
    /** Per-pool cooldown between alerts, in seconds. */
    cooldownSec: z.number().int().min(0).max(86_400).default(300),
    /** `pools` judges the hand-picked `agent_pools`; `screener` judges every screener pool that passes `preset`. */
    source: z.enum(VOLUME_SOURCES).default("pools"),
    /** A preset id reads `SCREENER_PRESETS` (filter and spike rule); `custom` reads `custom` with `mult` and `minUsd`. */
    preset: z.enum(PRESETS).default("blue-chip"),
    custom: PoolFilter.nullable().default(null),
  })
  .refine((c) => c.preset !== "custom" || c.custom !== null, {
    path: ["custom"],
    message: "A custom screener alert needs a filter",
  })
  .refine((c) => c.source !== "screener" || c.baseline <= SCREENER_MAX_BASELINE, {
    path: ["baseline"],
    message: `Up to ${SCREENER_MAX_BASELINE} minutes when watching the screener`,
  });
export type VolumeWatchConfig = z.infer<typeof VolumeWatchConfig>;

export const REBALANCE_STRATEGIES = ["Spot", "Curve", "BidAsk"] as const;

/**
 * What happens to the position's fees: left in the wallet, deposited back into the position (`compound`), or swapped
 * to SOL (`sweep`). One field because the two actions exclude each other.
 */
export const FEE_MODES = ["keep", "compound", "sweep"] as const;
export type FeeMode = (typeof FEE_MODES)[number];

export const AutoRebalanceConfig = z.object({
  /** Liquidity shape of the re-centered position. */
  strategy: z.enum(REBALANCE_STRATEGIES).default("Curve"),
  /** Slippage tolerance for the balancing swap, in basis points. */
  slippageBps: z.number().int().min(0).max(10_000).default(50),
  /** Bins on each side of the active bin; null keeps the position's current width. */
  halfWidth: z.number().int().min(1).max(1024).nullable().default(null),
  /** Per-pool quiet time after a rebalance (or its preview), in seconds. */
  cooldownSec: z.number().int().min(0).max(86_400).default(300),
  /** True records and reports the move only; false signs and sends it with the agent wallet. */
  dryRun: z.boolean().default(true),
  feeMode: z.enum(FEE_MODES).default("keep"),
  /** Claim in range once unclaimed fees are worth this many SOL; null claims only when a rebalance does. */
  feeClaimThresholdSol: z.number().positive().max(1000).nullable().default(null),
  /** SOL left in the agent wallet for transaction fees and rent; live actions pause below it. */
  solReserve: z.number().min(0).max(100).default(0.1),
});
export type AutoRebalanceConfig = z.infer<typeof AutoRebalanceConfig>;

export const AGENT_CONFIG = {
  "volume-watch": VolumeWatchConfig,
  "auto-rebalance": AutoRebalanceConfig,
} as const satisfies Record<AgentKind, z.ZodType>;

export type AgentConfig<K extends AgentKind> = z.infer<(typeof AGENT_CONFIG)[K]>;

export function parseAgentConfig<K extends AgentKind>(kind: K, config: unknown): AgentConfig<K> {
  return AGENT_CONFIG[kind].parse(config ?? {}) as AgentConfig<K>;
}

export function defaultAgentConfig<K extends AgentKind>(kind: K): AgentConfig<K> {
  return parseAgentConfig(kind, {});
}

/** `agents.paused_reason` the runner sets while the user has no linked Telegram chat; linking clears it. */
export const TELEGRAM_NOT_LINKED = "telegram_not_linked";

/**
 * `agents.paused_reason` the runner sets when the stored bot token no longer decrypts, which happens when
 * `TOKEN_ENC_KEY` changed after the user linked. The token cannot be recovered, so linking the bot again clears it.
 */
export const TELEGRAM_RELINK = "telegram_relink";

/** Pauses the runner sets over Telegram and that linking a chat clears. A pause the user chose is neither. */
export const TELEGRAM_PAUSES: readonly string[] = [TELEGRAM_NOT_LINKED, TELEGRAM_RELINK];

/**
 * `agents.paused_reason` the runner sets when the agent wallet's stored secret does not decrypt with this
 * `WALLET_ENC_KEY`, or does not match its public key. Saving the wallet again clears it.
 */
export const WALLET_UNREADABLE = "wallet_unreadable";

/** `agents.paused_reason` the runner sets after `REBALANCE_FAILURE_LIMIT` live rebalances failed in a row. Resuming clears it. */
export const REBALANCE_FAILING = "rebalance_failing";
export const REBALANCE_FAILURE_LIMIT = 3;

/** `agents.paused_reason` the runner sets when the agent wallet holds less SOL than `solReserve`. Resuming clears it. */
export const LOW_SOL = "low_sol";

/** `agent_rebalances.action`: a range move, or an in-range fee claim (which keeps the range). */
export const REBALANCE_ACTIONS = ["rebalance", "claim"] as const;
export type RebalanceAction = (typeof REBALANCE_ACTIONS)[number];
