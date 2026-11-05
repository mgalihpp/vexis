// Agent domain shared by the server and the pages: view types and the pure helpers. The only agent kind is
// `volume-watch`; its rows live in Postgres (`packages/db`) and are read through `agents.server.ts`.

import { type AgentKind, TELEGRAM_NOT_LINKED, VolumeWatchConfig } from "@vexis/db/agents";

export type { VolumeWatchConfig };
export { TELEGRAM_NOT_LINKED };

/** Pools one agent may watch. The runner reads them in batches of 100, so this is a UI limit, not a hard one. */
export const MAX_POOLS = 20;

export const DEFAULT_CONFIG: VolumeWatchConfig = VolumeWatchConfig.parse({});

export interface PoolView {
  id: string;
  address: string;
  label: string | null;
  lastAlertAt: number | null;
  /** Both sides of the pair with their icons; null when they could not be looked up. */
  tokens: [{ symbol: string; icon: string | null }, { symbol: string; icon: string | null }] | null;
}

export interface AgentView {
  id: string;
  kind: AgentKind;
  enabled: boolean;
  paused: boolean;
  pausedReason: string | null;
  config: VolumeWatchConfig;
  pools: PoolView[];
  /** Alerts in the 24 hours before `AgentsData.now`. */
  alerts24h: number;
  lastAlertAt: number | null;
}

export interface AgentsData {
  agents: AgentView[];
  /** Server time, so relative times render the same on the server and in the browser. */
  now: number;
}

export interface AlertView {
  id: string;
  agentId: string;
  poolAddress: string;
  poolLabel: string | null;
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

export interface TelegramView {
  linked: boolean;
  username: string | null;
  /** A pending one-time code to send to the bot, if one was started and has not expired. */
  code: { value: string; expiresAt: number } | null;
  botUsername: string | null;
}

// --- status ------------------------------------------------------------------------------------

export type AgentStatus = "live" | "paused" | "attention" | "off";

/** `attention` is a pause the runner set because the user has no Telegram chat to alert. */
export function agentStatus(a: Pick<AgentView, "enabled" | "paused" | "pausedReason">): AgentStatus {
  if (!a.enabled) return "off";
  if (a.paused) return a.pausedReason === TELEGRAM_NOT_LINKED ? "attention" : "paused";
  return "live";
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  live: "Watching",
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
] as const;

/** Agents from the design that are not built yet. Shown greyed out in the first step. */
export const COMING_SOON = [
  { name: "Auto-rebalance", sub: "Re-centers your range when price moves out" },
  { name: "Range guard", sub: "Warns before a position leaves its range" },
  { name: "Fee harvester", sub: "Claims and compounds fees on a schedule" },
] as const;

export interface DraftPool {
  address: string;
  label: string;
}

export interface Draft {
  pools: DraftPool[];
  fields: ConfigFields;
}

export const defaultDraft = (): Draft => ({ pools: [], fields: configFields(DEFAULT_CONFIG) });

export function draftIssues(d: Draft): string[] {
  const issues: string[] = [];
  if (d.pools.length === 0) issues.push("Pick at least one pool to watch");
  if (d.pools.length > MAX_POOLS) issues.push(`Watch at most ${MAX_POOLS} pools`);
  const config = parseConfigFields(d.fields);
  if (!config.ok) issues.push(...Object.values(config.errors));
  return issues;
}

// --- fleet -------------------------------------------------------------------------------------

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
