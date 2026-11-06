// Agent domain shared by the server and the pages: view types and the pure helpers. Agent kinds are
// `volume-watch` and `auto-rebalance`; their rows live in Postgres (`packages/db`) and are read through `agents.server.ts`.

import {
  type AgentKind,
  AutoRebalanceConfig,
  REBALANCE_STRATEGIES,
  TELEGRAM_NOT_LINKED,
  TELEGRAM_PAUSES,
  TELEGRAM_RELINK,
  VolumeWatchConfig,
} from "@vexis/db/agents";

export type { AgentKind, AutoRebalanceConfig, VolumeWatchConfig };
export { REBALANCE_STRATEGIES, TELEGRAM_NOT_LINKED, TELEGRAM_RELINK };

/** Pools one agent may watch. The runner reads them in batches of 100, so this is a UI limit, not a hard one. */
export const MAX_POOLS = 20;

export const DEFAULT_CONFIG: VolumeWatchConfig = VolumeWatchConfig.parse({});
export const DEFAULT_REBALANCE_CONFIG: AutoRebalanceConfig = AutoRebalanceConfig.parse({});

/** Both sides of a pair with their icons; null when they could not be looked up. */
export type PairTokens = [{ symbol: string; icon: string | null }, { symbol: string; icon: string | null }] | null;

export interface PoolView {
  id: string;
  address: string;
  label: string | null;
  lastAlertAt: number | null;
  tokens: PairTokens;
}

interface AgentBase {
  id: string;
  enabled: boolean;
  paused: boolean;
  pausedReason: string | null;
  pools: PoolView[];
  /** Alerts (or rebalance previews) in the 24 hours before `AgentsData.now`. */
  alerts24h: number;
  lastAlertAt: number | null;
}

export type VolumeAgentView = AgentBase & { kind: "volume-watch"; config: VolumeWatchConfig };
export type RebalanceAgentView = AgentBase & {
  kind: "auto-rebalance";
  config: AutoRebalanceConfig;
  /** Public key of the wallet the agent manages; null until the user saves one. */
  wallet: string | null;
};
export type AgentView = VolumeAgentView | RebalanceAgentView;

export const AGENT_NAME: Record<AgentKind, string> = {
  "volume-watch": "Volume spike",
  "auto-rebalance": "Auto-rebalance",
};

export interface AgentsData {
  agents: AgentView[];
  /** Server time, so relative times render the same on the server and in the browser. */
  now: number;
}

export interface AlertView {
  id: string;
  agentId: string;
  poolAddress: string;
  /** The watched pool's label, else the pair's symbols; null when neither is known. */
  poolLabel: string | null;
  /** Looked up per pool, so alerts from a pool the agent no longer watches keep their logos. */
  tokens: PairTokens;
  vol1m: number;
  baseline: number;
  ratio: number;
  delivered: boolean;
  error: string | null;
  at: number;
}

export interface AlertsData {
  alerts: AlertView[];
  now: number;
}

export interface RebalanceView {
  id: string;
  poolAddress: string;
  poolLabel: string | null;
  tokens: PairTokens;
  positionAddress: string;
  activeBin: number;
  lowerBin: number;
  upperBin: number;
  newLowerBin: number;
  newUpperBin: number;
  /** Null for a preview: nothing was sent on-chain. */
  signature: string | null;
  delivered: boolean;
  error: string | null;
  at: number;
}

export interface RebalancesData {
  rebalances: RebalanceView[];
  now: number;
}

/** A base58 Solana secret key (64 bytes) is 86 to 88 characters. Checked again, and decoded, on the server. */
export const SECRET_KEY_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/;

/** `<bot id>:<secret>`, as BotFather hands it out. Checked in the browser and again on the server. */
export const BOT_TOKEN_PATTERN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

export interface TelegramView {
  /** The user's own bot. Null until they connect one; `linked` once a chat has written to it. */
  bot: { username: string; linked: boolean; chatUsername: string | null } | null;
  /** The bot whose saved token can no longer be read (the server's key changed). `bot` is null; paste it again. */
  relink: string | null;
}

// --- status ------------------------------------------------------------------------------------

export type AgentStatus = "live" | "paused" | "attention" | "off";

type StatusInput = Pick<AgentView, "enabled" | "paused" | "pausedReason"> & { wallet?: string | null };

/**
 * `attention` is a pause the runner set because it cannot alert over Telegram (no chat, or a token to re-link),
 * or an auto-rebalance agent with no wallet, which the runner skips until one is saved.
 */
export function agentStatus(a: StatusInput): AgentStatus {
  if (!a.enabled) return "off";
  if (a.wallet === null) return "attention";
  if (a.paused) return a.pausedReason && TELEGRAM_PAUSES.includes(a.pausedReason) ? "attention" : "paused";
  return "live";
}

/** The status hint, worded for why the runner paused the agent. */
export function statusHint(a: StatusInput): string | undefined {
  if (agentStatus(a) === "attention" && a.wallet === null) {
    return "Waiting for a wallet. Save the wallet whose position this agent manages and it starts checking.";
  }
  if (agentStatus(a) === "attention" && a.pausedReason === TELEGRAM_RELINK) {
    return "Paused because the saved bot token can no longer be read. Connect your bot again and the agent resumes.";
  }
  return STATUS_HINT[agentStatus(a)];
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  live: "Active",
  paused: "Paused",
  attention: "Needs Telegram",
  off: "Off",
};

export const STATUS_HINT: Partial<Record<AgentStatus, string>> = {
  attention: "Paused because no Telegram chat is linked. Link one and the agent resumes.",
  off: "Turned off. Nothing is checked until you turn it back on.",
};

// --- rules -------------------------------------------------------------------------------------

const usd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function formatMinutes(seconds: number) {
  const m = seconds / 60;
  return `${Number.isInteger(m) ? m : m.toFixed(1)} min`;
}

/** One line for cards: when an alert fires. */
export function describeRule(c: Pick<VolumeWatchConfig, "mult" | "baseline" | "minUsd" | "cooldownSec">) {
  return `≥ ${c.mult}× the median of the last ${c.baseline} minutes, at least ${usd(c.minUsd)} in a minute, then quiet for ${formatMinutes(c.cooldownSec)}`;
}

export const ratioText = (ratio: number) => (ratio >= 1_000_000 ? "from zero" : `${ratio.toFixed(1)}×`);

/** `$18.4k`, `$1.2M`, `$850`. */
export function compactUsd(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

// --- config form -------------------------------------------------------------------------------

export interface ConfigFields {
  mult: string;
  baseline: string;
  minUsd: string;
  cooldownMin: string;
}

export const configFields = (c: VolumeWatchConfig): ConfigFields => ({
  mult: String(c.mult),
  baseline: String(c.baseline),
  minUsd: String(c.minUsd),
  cooldownMin: String(c.cooldownSec / 60),
});

export type ConfigResult =
  | { ok: true; config: VolumeWatchConfig }
  | { ok: false; errors: Partial<Record<keyof ConfigFields, string>> };

const FIELD_OF: Record<string, keyof ConfigFields> = {
  mult: "mult",
  baseline: "baseline",
  minUsd: "minUsd",
  cooldownSec: "cooldownMin",
};

/** Form text to a validated config. `intervalSec` is not editable and keeps its current value. */
export function parseConfigFields(fields: ConfigFields, current: VolumeWatchConfig = DEFAULT_CONFIG): ConfigResult {
  const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
  const parsed = VolumeWatchConfig.safeParse({
    ...current,
    mult: num(fields.mult),
    baseline: num(fields.baseline),
    minUsd: num(fields.minUsd),
    cooldownSec: Math.round(num(fields.cooldownMin) * 60),
  });
  if (parsed.success) return { ok: true, config: parsed.data };
  const errors: Partial<Record<keyof ConfigFields, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = FIELD_OF[String(issue.path[0])];
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

// --- wizard ------------------------------------------------------------------------------------

export const WIZARD_STEPS = ["agent", "pools", "rules", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Agent types the wizard offers. Adding a kind here adds a row to the first step. */
export const AGENT_TYPES = [
  { kind: "volume-watch", name: "Volume spike alert", sub: "Telegram alert when pool volume jumps" },
  {
    kind: "auto-rebalance",
    name: "Auto-rebalance",
    sub: "Re-centers your range when price moves out (preview only for now)",
  },
] as const satisfies readonly { kind: AgentKind; name: string; sub: string }[];

/** Agents from the design that are not built yet. Shown greyed out in the first step. */
export const COMING_SOON = [
  { name: "Range guard", sub: "Warns before a position leaves its range" },
  { name: "Fee harvester", sub: "Claims and compounds fees on a schedule" },
] as const;

export interface DraftPool {
  address: string;
  label: string;
}

export interface Draft {
  kind: AgentKind;
  pools: DraftPool[];
  fields: ConfigFields;
  rebalanceFields: RebalanceFields;
}

export const defaultDraft = (kind: AgentKind = "volume-watch"): Draft => ({
  kind,
  pools: [],
  fields: configFields(DEFAULT_CONFIG),
  rebalanceFields: rebalanceFields(DEFAULT_REBALANCE_CONFIG),
});

/** `wallet` is the saved wallet's public key; only an auto-rebalance agent needs one. */
export function draftIssues(d: Draft, wallet: string | null = null): string[] {
  const issues: string[] = [];
  if (d.pools.length === 0) issues.push("Pick at least one pool to watch");
  if (d.pools.length > MAX_POOLS) issues.push(`Watch at most ${MAX_POOLS} pools`);
  const config = d.kind === "auto-rebalance" ? parseRebalanceFields(d.rebalanceFields) : parseConfigFields(d.fields);
  if (!config.ok) issues.push(...Object.values(config.errors));
  if (d.kind === "auto-rebalance" && !wallet) issues.push("Save the wallet this agent manages");
  return issues;
}

// --- auto-rebalance form -----------------------------------------------------------------------

export interface RebalanceFields {
  strategy: AutoRebalanceConfig["strategy"];
  slippageBps: string;
  /** Empty keeps the position's current width. */
  halfWidth: string;
  cooldownMin: string;
}

export const rebalanceFields = (c: AutoRebalanceConfig): RebalanceFields => ({
  strategy: c.strategy,
  slippageBps: String(c.slippageBps),
  halfWidth: c.halfWidth === null ? "" : String(c.halfWidth),
  cooldownMin: String(c.cooldownSec / 60),
});

export type RebalanceResult =
  | { ok: true; config: AutoRebalanceConfig }
  | { ok: false; errors: Partial<Record<keyof RebalanceFields, string>> };

export function parseRebalanceFields(fields: RebalanceFields): RebalanceResult {
  const num = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
  const parsed = AutoRebalanceConfig.safeParse({
    strategy: fields.strategy,
    slippageBps: num(fields.slippageBps),
    halfWidth: fields.halfWidth.trim() === "" ? null : num(fields.halfWidth),
    cooldownSec: Math.round(num(fields.cooldownMin) * 60),
  });
  if (parsed.success) return { ok: true, config: parsed.data };
  const errors: Partial<Record<keyof RebalanceFields, string>> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    const field = (key === "cooldownSec" ? "cooldownMin" : key) as keyof RebalanceFields;
    if (!errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

/** `Same width` or `±34 bins`. */
export const describeWidth = (halfWidth: number | null) => (halfWidth === null ? "Same width" : `±${halfWidth} bins`);

// --- fleet -------------------------------------------------------------------------------------

/** The agent's rule as three labelled values, for the fleet's cards and table. */
export function ruleSummary(a: AgentView): [string, string][] {
  if (a.kind === "auto-rebalance") {
    return [
      ["Strategy", a.config.strategy],
      ["Width", describeWidth(a.config.halfWidth)],
      ["Slippage", `${a.config.slippageBps} bps`],
    ];
  }
  return [
    ["Spike", `≥ ${a.config.mult}×`],
    ["Baseline", formatMinutes(a.config.baseline * 60)],
    ["Min volume", `${compactUsd(a.config.minUsd)}/min`],
  ];
}

export interface FleetSummary {
  total: number;
  live: number;
  attention: number;
  pools: number;
  alerts24h: number;
}

export function summarizeFleet(agents: AgentView[]): FleetSummary {
  const statuses = agents.map(agentStatus);
  return {
    total: agents.length,
    live: statuses.filter((s) => s === "live").length,
    attention: statuses.filter((s) => s === "attention").length,
    pools: agents.reduce((n, a) => n + a.pools.length, 0),
    alerts24h: agents.reduce((n, a) => n + a.alerts24h, 0),
  };
}
