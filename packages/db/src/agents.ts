import { z } from "zod";

// Agent kinds and their config schemas. `agents.config` is jsonb; every write goes through
// `parseAgentConfig`, and the runner parses again on read so a bad row is skipped, not run.

export const AGENT_KINDS = ["volume-watch"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export const VolumeWatchConfig = z.object({
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
});
export type VolumeWatchConfig = z.infer<typeof VolumeWatchConfig>;

export const AGENT_CONFIG = {
  "volume-watch": VolumeWatchConfig,
} as const satisfies Record<AgentKind, z.ZodType>;

export type AgentConfig<K extends AgentKind> = z.infer<(typeof AGENT_CONFIG)[K]>;

export function parseAgentConfig<K extends AgentKind>(kind: K, config: unknown): AgentConfig<K> {
  return AGENT_CONFIG[kind].parse(config ?? {}) as AgentConfig<K>;
}

export function defaultAgentConfig<K extends AgentKind>(kind: K): AgentConfig<K> {
  return parseAgentConfig(kind, {});
}
