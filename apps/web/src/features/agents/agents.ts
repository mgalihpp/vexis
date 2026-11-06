// Agent domain shared by the server and the pages: view types and the pure helpers. Agent kinds are
// `volume-watch` and `auto-rebalance`; their rows live in Postgres (`packages/db`) and are read through `agents.server.ts`.

import {
  type AgentKind,
  AutoRebalanceConfig,
  FEE_MODES,
  type FeeMode,
  LOW_SOL,
  REBALANCE_FAILING,
  REBALANCE_FAILURE_LIMIT,
  REBALANCE_STRATEGIES,
  type RebalanceAction,
  TELEGRAM_NOT_LINKED,
  TELEGRAM_PAUSES,
  TELEGRAM_RELINK,
  VolumeWatchConfig,
  WALLET_UNREADABLE,
} from "@vexis/db/agents";
import { shortAddr } from "@/lib/format";

export type { AgentKind, AutoRebalanceConfig, FeeMode, VolumeWatchConfig };
export {
  FEE_MODES,
  LOW_SOL,
  REBALANCE_FAILING,
  REBALANCE_FAILURE_LIMIT,
  REBALANCE_STRATEGIES,
  TELEGRAM_NOT_LINKED,
  TELEGRAM_RELINK,
  WALLET_UNREADABLE,
};

/** Pools a volume-watch agent may watch. The runner reads them in batches of 100, so this is a UI limit, not a hard one. */
export const MAX_POOLS = 20;

/** An auto-rebalance agent manages one position in one pool, fixed when it is created. */
export const poolLimit = (kind: AgentKind) => (kind === "auto-rebalance" ? 1 : MAX_POOLS);

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
  /** Alerts (or out-of-range rebalances) in the 24 hours before `AgentsData.now`. */
  alerts24h: number;
  lastAlertAt: number | null;
}

export type VolumeAgentView = AgentBase & { kind: "volume-watch"; config: VolumeWatchConfig };
export type RebalanceAgentView = AgentBase & {
  kind: "auto-rebalance";
  config: AutoRebalanceConfig;
  /** Public key of the wallet the agent manages; null until the user saves one. */
  wallet: string | null;
  /** Host of the wallet's RPC URL; null until the user adds one (or it can no longer be read). */
  rpcHost: string | null;
};
export type AgentView = VolumeAgentView | RebalanceAgentView;

export const AGENT_NAME: Record<AgentKind, string> = {
  "volume-watch": "Volume spike",
  "auto-rebalance": "Auto-rebalance",
};

/** The pool's label, else the pair's symbols, else its short address. */
export const pairName = (p: Pick<PoolView, "address" | "label" | "tokens">) =>
  p.label ?? (p.tokens ? `${p.tokens[0].symbol}-${p.tokens[1].symbol}` : shortAddr(p.address));

/** A user may run several auto-rebalance agents, so each is named by its pool. */
export function agentName(a: AgentView) {
  const pool = a.kind === "auto-rebalance" ? a.pools[0] : undefined;
  return pool ? `${AGENT_NAME[a.kind]} ${pairName(pool)}` : AGENT_NAME[a.kind];
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
  /** A range move, or an in-range fee claim (whose old and new range are the same). */
  action: RebalanceAction;
  /** Unclaimed fees in SOL when the runner acted; null when unknown. */
  feeSol: number | null;
  poolAddress: string;
  poolLabel: string | null;
  tokens: PairTokens;
  positionAddress: string;
  activeBin: number;
  lowerBin: number;
  upperBin: number;
  newLowerBin: number;
  newUpperBin: number;
  /** Sent on-chain; false for a preview, where nothing was signed. */
  live: boolean;
  /** Set once a live rebalance confirmed. */
  signature: string | null;
  /** Why a live rebalance failed. A live row with neither is still in flight (or the runner stopped mid-send). */
  txError: string | null;
  delivered: boolean;
  error: string | null;
  at: number;
}

export interface RebalancesData {
  rebalances: RebalanceView[];
  /** The agent's fee mode, which names what a claim row did. */
  feeMode: FeeMode;
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

type StatusInput = Pick<AgentView, "enabled" | "paused" | "pausedReason"> & {
  wallet?: string | null;
  rpcHost?: string | null;
};

/**
 * Runner pauses the user has to act on. Linking Telegram or saving the wallet again clears those on its own; a low
 * SOL balance needs a top-up and then a resume.
 */
const ATTENTION_PAUSES: readonly string[] = [...TELEGRAM_PAUSES, WALLET_UNREADABLE, LOW_SOL];

/**
 * `attention` is a pause the runner set because the setup is broken (no Telegram chat, a bot token to re-link, a
 * wallet whose key no longer decrypts, too little SOL), or an auto-rebalance agent with no wallet or RPC URL, which
 * the runner skips until both are saved.
 */
export function agentStatus(a: StatusInput): AgentStatus {
  if (!a.enabled) return "off";
  if (a.wallet === null || a.rpcHost === null) return "attention";
  if (a.paused) return a.pausedReason && ATTENTION_PAUSES.includes(a.pausedReason) ? "attention" : "paused";
  return "live";
}

/** The status hint, worded for why the runner paused the agent. */
export function statusHint(a: StatusInput): string | undefined {
  if (agentStatus(a) === "attention" && a.wallet === null) {
    return "Waiting for a wallet. Save the wallet whose position this agent manages and it starts checking.";
  }
  if (agentStatus(a) === "attention" && a.rpcHost === null) {
    return "Add an RPC URL. The agent reads and sends through your own Solana RPC and is skipped until it has one.";
  }
  if (agentStatus(a) === "attention" && a.pausedReason === LOW_SOL) {
    return "Low SOL, top up then resume. The agent wallet held less SOL than the reserve it keeps for fees and rent.";
  }
  if (agentStatus(a) === "attention" && a.pausedReason === TELEGRAM_RELINK) {
    return "Paused because the saved bot token can no longer be read. Connect your bot again and the agent resumes.";
  }
  if (agentStatus(a) === "attention" && a.pausedReason === WALLET_UNREADABLE) {
    return "Paused because the saved wallet key can no longer be read. Save the wallet again and the agent resumes.";
  }
  if (agentStatus(a) === "paused" && a.pausedReason === REBALANCE_FAILING) {
    return `Paused after ${REBALANCE_FAILURE_LIMIT} failed rebalances in a row. Check the errors in the history, then resume.`;
  }
  return STATUS_HINT[agentStatus(a)];
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  live: "Active",
  paused: "Paused",
  attention: "Needs attention",
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
    sub: "Moves your position back into range when price leaves it",
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

/** Pools the user's auto-rebalance agents already manage; a second agent on one would act on the same position. */
export const managedPools = (agents: AgentView[]) =>
  new Set(agents.flatMap((a) => (a.kind === "auto-rebalance" ? a.pools.map((p) => p.address) : [])));

/**
 * `wallet` and `rpcHost` describe the saved agent wallet, which only an auto-rebalance agent needs. `managed` holds
 * the pools another auto-rebalance agent already runs on.
 */
export function draftIssues(
  d: Draft,
  setup: { wallet?: string | null; rpcHost?: string | null; managed?: ReadonlySet<string> } = {},
): string[] {
  const issues: string[] = [];
  const max = poolLimit(d.kind);
  if (d.pools.length === 0) issues.push(max === 1 ? "Pick the pool to manage" : "Pick at least one pool to watch");
  if (d.pools.length > max) {
    issues.push(max === 1 ? "An auto-rebalance agent manages one pool" : `Watch at most ${max} pools`);
  }
  const config = d.kind === "auto-rebalance" ? parseRebalanceFields(d.rebalanceFields) : parseConfigFields(d.fields);
  if (!config.ok) issues.push(...Object.values(config.errors));
  if (d.kind === "auto-rebalance") {
    if (d.pools.some((p) => setup.managed?.has(p.address))) {
      issues.push("Another auto-rebalance agent already manages this pool");
    }
    if (!setup.wallet) issues.push("Save the wallet this agent manages");
    else if (!setup.rpcHost) issues.push("Add the RPC URL the agent sends through");
  }
  return issues;
}

// --- auto-rebalance form -----------------------------------------------------------------------

export interface RebalanceFields {
  strategy: AutoRebalanceConfig["strategy"];
  slippageBps: string;
  /** Empty keeps the position's current width. */
  halfWidth: string;
  cooldownMin: string;
  /** True records and reports moves only; false signs and sends them with the agent wallet. */
  dryRun: boolean;
  feeMode: FeeMode;
  /** SOL; empty claims fees only when a rebalance does. */
  feeClaimThresholdSol: string;
  solReserve: string;
}

export const rebalanceFields = (c: AutoRebalanceConfig): RebalanceFields => ({
  strategy: c.strategy,
  slippageBps: String(c.slippageBps),
  halfWidth: c.halfWidth === null ? "" : String(c.halfWidth),
  cooldownMin: String(c.cooldownSec / 60),
  dryRun: c.dryRun,
  feeMode: c.feeMode,
  feeClaimThresholdSol: c.feeClaimThresholdSol === null ? "" : String(c.feeClaimThresholdSol),
  solReserve: String(c.solReserve),
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
    dryRun: fields.dryRun,
    feeMode: fields.feeMode,
    feeClaimThresholdSol: fields.feeClaimThresholdSol.trim() === "" ? null : num(fields.feeClaimThresholdSol),
    solReserve: num(fields.solReserve),
  });
  const errors: Partial<Record<keyof RebalanceFields, string>> = {};
  for (const issue of parsed.success ? [] : parsed.error.issues) {
    const key = String(issue.path[0]);
    const field = (key === "cooldownSec" ? "cooldownMin" : key) as keyof RebalanceFields;
    if (!errors[field]) errors[field] = issue.message;
  }
  if (fields.feeMode === "keep" && fields.feeClaimThresholdSol.trim() !== "") {
    errors.feeClaimThresholdSol ??= "Fees kept in the position are never claimed in range; pick compound or sweep";
  }
  if (parsed.success && Object.keys(errors).length === 0) return { ok: true, config: parsed.data };
  return { ok: false, errors };
}

export const modeLabel = (c: Pick<AutoRebalanceConfig, "dryRun">) => (c.dryRun ? "Preview" : "Live");

export const FEE_MODE_LABEL: Record<FeeMode, string> = {
  keep: "Keep in wallet",
  compound: "Compound into the position",
  sweep: "Sweep to SOL",
};

/** `0.05 SOL`, up to 4 decimals. */
export const solText = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL`;

/** What happens to the fees, and whether they are also claimed in range. */
export function describeFees(c: Pick<AutoRebalanceConfig, "feeMode" | "feeClaimThresholdSol">) {
  if (c.feeMode === "keep") return FEE_MODE_LABEL.keep;
  const action = c.feeMode === "compound" ? "Compound" : "Sweep to SOL";
  return c.feeClaimThresholdSol === null
    ? `${action} on rebalance`
    : `${action}, claim at ${solText(c.feeClaimThresholdSol)}`;
}

/** `Same width` or `±34 bins`. */
export const describeWidth = (halfWidth: number | null) => (halfWidth === null ? "Same width" : `±${halfWidth} bins`);

// --- fleet -------------------------------------------------------------------------------------

/** The agent's rule as three labelled values, for the fleet's cards and table. */
export function ruleSummary(a: AgentView): [string, string][] {
  if (a.kind === "auto-rebalance") {
    return [
      ["Mode", modeLabel(a.config)],
      ["Width", describeWidth(a.config.halfWidth)],
      ["Fees", { keep: "Keep", compound: "Compound", sweep: "Sweep" }[a.config.feeMode]],
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
