import { z } from "zod";
import { REBALANCE_STRATEGIES } from "./agents.ts";
import { PoolFilter, PRESETS, presetFilter } from "./screen.ts";

// The virtual office: four LLM agents propose, guardrails in code check, the owner approves. Shared by the web app,
// `apps/office` and (from V1) the runner. Every jsonb column here is parsed with these schemas on write and on read.

/** The agents that call an LLM. They only write text and proposals. */
export const LLM_AGENTS = ["scout", "strategist", "risk", "manager"] as const;
export type LlmAgent = (typeof LLM_AGENTS)[number];

/** Every desk on the floor. Monitor, Executor and Bookkeeper are plain code in the runner (V1). */
export const OFFICE_AGENTS = [...LLM_AGENTS, "monitor", "executor", "bookkeeper"] as const;
export type OfficeAgent = (typeof OFFICE_AGENTS)[number];

export const LLM_PROVIDERS = ["claude", "openai", "deepseek", "meta", "openrouter"] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<LlmProvider, string> = {
  claude: "Claude",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  meta: "Meta",
  openrouter: "OpenRouter",
};

/** USD per million tokens. A model missing here cannot be picked, so every run has a known cost. */
export type ModelPrice = { readonly input: number; readonly output: number };

// Checked 2026-11-15 against each provider's pricing page. DeepSeek bills double during its peak hours; the peak
// rate is kept so the daily budget never undercounts. Haiku 5.5's rate is for prompts up to 100k tokens, Muse Ember's
// up to 200k. Meta is the Meta Model API (dev.meta.ai) in Standard mode; Contributor mode trains on what we send.
// OpenRouter prices are its /api/v1/models listing; the provider sends them as `max_price`, so routing never costs more.
export const MODEL_PRICES: Record<LlmProvider, Record<string, ModelPrice>> = {
  claude: {
    "claude-haiku-5-5": { input: 0.1, output: 0.5 },
    "claude-sonnet-5-5": { input: 2, output: 10 },
    "claude-opus-5-5": { input: 4, output: 20 },
  },
  openai: {
    "gpt-6-luna": { input: 0.1, output: 0.5 },
    "gpt-6.1-terra": { input: 1, output: 5 },
    "gpt-6.1-sol": { input: 2, output: 10 },
  },
  deepseek: {
    "deepseek-flash": { input: 0.3, output: 1.2 },
    "deepseek-v4-pro": { input: 1.32, output: 3.96 },
  },
  meta: {
    "muse-ember-1.0": { input: 0.1, output: 0.5 },
    "muse-spark-1.3": { input: 1.25, output: 4.25 },
    "muse-wonder-1.0": { input: 4, output: 20 },
  },
  openrouter: {
    "anthropic/claude-haiku-5.5": { input: 0.1, output: 0.5 },
    "anthropic/claude-sonnet-5.5": { input: 2, output: 10 },
    "openai/gpt-6-luna": { input: 0.1, output: 0.5 },
    "openai/gpt-6.1-terra": { input: 1, output: 5 },
    "google/gemini-4-hydrogen": { input: 1.5, output: 7.5 },
    "deepseek/deepseek-v4.1-flash": { input: 0.14, output: 0.42 },
    "qwen/qwen3.8-flash": { input: 0.15, output: 0.47 },
    "x-ai/grok-4.7": { input: 2, output: 6 },
    // Free endpoints, for running an office without spending. OpenRouter rate-limits them hard (a few dozen calls a
    // day without credit), so a tick that seats four agents can use up the day. Price 0 bills nothing and never
    // exhausts the daily cap.
    "openrouter/free": { input: 0, output: 0 },
    "inclusionai/ling-3.2-flash:free": { input: 0, output: 0 },
    "baidu/ernie-5.5-flash-preview:free": { input: 0, output: 0 },
  },
};

export const modelsOf = (provider: LlmProvider) => Object.keys(MODEL_PRICES[provider]);

/** Cost of one call in USD, or null for a model with no listed price. */
export function runCost(provider: LlmProvider, model: string, inputTokens: number, outputTokens: number) {
  const price = MODEL_PRICES[provider][model];
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export const AgentModel = z
  .object({ provider: z.enum(LLM_PROVIDERS), model: z.string().min(1).max(100) })
  .refine((m) => MODEL_PRICES[m.provider][m.model] !== undefined, {
    path: ["model"],
    message: "Pick a model from the list",
  });
export type AgentModel = z.infer<typeof AgentModel>;

/** The model each LLM agent runs on under own keys. There is no default there: an agent with null does not run. */
export const OfficeModels = z.object({
  scout: AgentModel.nullable().default(null),
  strategist: AgentModel.nullable().default(null),
  risk: AgentModel.nullable().default(null),
  manager: AgentModel.nullable().default(null),
});
export type OfficeModels = z.infer<typeof OfficeModels>;

/** `vexis` bills Vexis's own keys under the admin's daily cap; `own` uses the keys the user saved. */
export const KEY_SOURCES = ["vexis", "own"] as const;
export type KeySource = (typeof KEY_SOURCES)[number];

const VEXIS_MODEL: AgentModel = { provider: "claude", model: "claude-haiku-5-5" };

/** Under the Vexis key Vexis picks every agent's model (the cheapest Claude, so the admin's cap goes furthest). */
export const VEXIS_MODELS: OfficeModels = {
  scout: VEXIS_MODEL,
  strategist: VEXIS_MODEL,
  risk: VEXIS_MODEL,
  manager: VEXIS_MODEL,
};

/** The models the office actually runs on: Vexis's under the Vexis key, the owner's picks under own keys. */
export const activeModels = (keySource: KeySource, models: OfficeModels): OfficeModels =>
  keySource === "vexis" ? VEXIS_MODELS : models;

/** `autopilot` (V2) approves proposals under a nominal limit on its own. */
export const OFFICE_MODES = ["approval", "autopilot"] as const;
export type OfficeMode = (typeof OFFICE_MODES)[number];

/** Hard rules, checked in code by `guardrails.ts`. Only the owner changes them, from the web. */
export const Guardrails = z.object({
  /** Largest share of the office's capital (free SOL plus open positions at cost) one position may take, in percent. */
  maxPositionPct: z.number().gt(0).max(100).default(25),
  maxActivePositions: z.number().int().min(1).max(20).default(3),
  /** The office's loss today (realized plus unrealized on its own positions) against its capital at the day start. */
  maxDailyLossPct: z.number().gt(0).max(100).default(5),
  /** SOL that always stays in the wallet. */
  solReserve: z.number().min(0).max(100).default(0.1),
  /** Quiet time per pool after an execution, in seconds. */
  cooldownSec: z.number().int().min(0).max(86_400).default(300),
  /** Failed executions in a row that pause the office. */
  maxConsecutiveFailures: z.number().int().min(1).max(20).default(3),
  /** How long a proposal waits for approval before it expires, in seconds. */
  approvalTtlSec: z.number().int().min(60).max(86_400).default(900),
  /** Gain on a position's cost, in percent, at which the Monitor proposes to take profit. */
  tpPct: z.number().gt(0).max(1000).default(10),
  /** Loss on a position's cost, in percent, at which the Monitor proposes to stop it out. */
  slPct: z.number().gt(0).max(100).default(5),
  /** Unclaimed fees, in percent of the position's cost, at which the Monitor proposes a claim. */
  claimFeePct: z.number().gt(0).max(100).default(1),
  /** USD a day the office may spend on LLM calls with the user's own keys. The admin sets the Vexis-key cap. */
  dailyLlmUsd: z.number().min(0).max(1000).default(1),
});
export type Guardrails = z.infer<typeof Guardrails>;

export const parseGuardrails = (raw: unknown) => Guardrails.parse(raw ?? {});
export const parseModels = (raw: unknown) => OfficeModels.parse(raw ?? {});

/**
 * The screener pools the office scouts and its Risk Manager allows: a preset, or the owner's custom filter (handed
 * over by the screener). Custom with no filter is stored as is and stops the Scout; it never falls back to a preset.
 */
export const OfficeScreen = z.object({
  preset: z.enum(PRESETS).default("blue-chip"),
  custom: PoolFilter.nullable().default(null),
});
export type OfficeScreen = z.infer<typeof OfficeScreen>;

export const parseScreen = (row: { poolPreset: string | null; poolFilter: unknown }) =>
  OfficeScreen.parse({ preset: row.poolPreset ?? undefined, custom: row.poolFilter ?? null });

/** The filter the office screens with; null for custom with no filter. */
export const officeFilter = (s: OfficeScreen) => presetFilter(s.preset, s.custom);

// --- proposals -------------------------------------------------------------------------------

export const PROPOSAL_KINDS = ["open", "rebalance", "claim", "close"] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_STATUSES = [
  "draft",
  "risk_checked",
  "awaiting_approval",
  "approved",
  "executing",
  "done",
  "rejected",
  "failed",
  "expired",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/**
 * The only legal moves. A risk veto is draft → rejected (`decided_by` risk); the kill switch rejects anything not
 * yet executing.
 */
const TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  draft: ["risk_checked", "rejected"],
  risk_checked: ["awaiting_approval", "rejected", "expired"],
  awaiting_approval: ["approved", "rejected", "expired"],
  approved: ["executing", "rejected"],
  executing: ["done", "failed"],
  done: [],
  rejected: [],
  failed: [],
  expired: [],
};

export const FINAL_STATUSES = PROPOSAL_STATUSES.filter((s) => TRANSITIONS[s].length === 0);
export const OPEN_STATUSES = PROPOSAL_STATUSES.filter((s) => TRANSITIONS[s].length > 0);

export const canTransition = (from: ProposalStatus, to: ProposalStatus) => TRANSITIONS[from].includes(to);

/** Returns `to`, or throws for a move the lifecycle does not allow. */
export function transition(from: ProposalStatus, to: ProposalStatus): ProposalStatus {
  if (!canTransition(from, to)) throw new Error(`Illegal proposal transition ${from} → ${to}`);
  return to;
}

/** Who decided a proposal's fate. */
export const DECIDERS = ["owner", "autopilot", "risk", "kill_switch", "system"] as const;
export type Decider = (typeof DECIDERS)[number];

/** `owner` is a close the owner asked for by hand on `/office`. */
export const PROPOSERS = ["strategist", "monitor", "owner"] as const;
export type Proposer = (typeof PROPOSERS)[number];

const Strategy = z.enum(REBALANCE_STRATEGIES);
const Bin = z.number().int();

const BinRange = z
  .object({ lowerBin: Bin, upperBin: Bin })
  .refine((r) => r.lowerBin <= r.upperBin, { path: ["upperBin"], message: "upperBin is below lowerBin" });

/** `params` per kind. The active bin and SOL price are what the proposer saw, so the card shows the same numbers. */
export const PROPOSAL_PARAMS = {
  open: z
    .object({
      strategy: Strategy,
      activeBin: Bin,
      lowerBin: Bin,
      upperBin: Bin,
      amountSol: z.number().positive(),
      solUsd: z.number().positive().nullable(),
      /** Deposit only SOL on its side of the pair, instead of swapping part of it for the other token. */
      singleSidedSol: z.boolean().default(false),
    })
    .refine((p) => p.lowerBin <= p.activeBin && p.activeBin <= p.upperBin, {
      path: ["activeBin"],
      message: "The range must hold the active bin",
    }),
  rebalance: BinRange.and(z.object({ strategy: Strategy, activeBin: Bin })),
  claim: z.object({ feeSol: z.number().nonnegative().nullable() }),
  close: z.object({ reason: z.enum(["take_profit", "stop_loss", "out_of_range", "manual"]) }),
} as const satisfies Record<ProposalKind, z.ZodType>;

export type ProposalParams<K extends ProposalKind> = z.infer<(typeof PROPOSAL_PARAMS)[K]>;

export function parseProposalParams<K extends ProposalKind>(kind: K, raw: unknown): ProposalParams<K> {
  return PROPOSAL_PARAMS[kind].parse(raw) as ProposalParams<K>;
}

/** One guardrail's verdict, shown on the approval card. */
export const GuardrailCheck = z.object({ rule: z.string(), ok: z.boolean(), value: z.string() });
export type GuardrailCheck = z.infer<typeof GuardrailCheck>;

/** `risk_notes`: every code check, then the Risk agent's own note. The LLM may add a veto, never lift one. */
export const RiskNotes = z.object({
  checks: z.array(GuardrailCheck),
  llm: z.object({ veto: z.boolean(), note: z.string() }).nullable(),
});
export type RiskNotes = z.infer<typeof RiskNotes>;

// --- pauses ----------------------------------------------------------------------------------

/** `office_config.paused_reason`. A reason with `paused_until` clears itself when that time passes. */
export const KILL_SWITCH = "kill_switch";
export const DAILY_LOSS = "daily_loss";
export const EXECUTION_FAILING = "execution_failing";
export const ADMIN_STOP = "admin_stop";

/** Slippage the Executor allows on every swap and deposit, in basis points. */
export const OFFICE_SLIPPAGE_BPS = 50;

/** Reasons the owner may lift; daily loss only once its `pausedUntil` passed, and an admin stop never. */
export const OWNER_CLEARS: ReadonlySet<string> = new Set([KILL_SWITCH, DAILY_LOSS, EXECUTION_FAILING]);

/** The pause columns, with `pausedUntil` in ms. */
export type PauseFields = { paused: boolean; pausedReason: string | null; pausedUntil: number | null };

/** A pause whose `pausedUntil` passed has cleared itself. */
export const isPaused = (c: PauseFields, now: number) => c.paused && (c.pausedUntil === null || c.pausedUntil > now);

export const ownerCanResume = (c: PauseFields) =>
  c.pausedReason !== null && OWNER_CLEARS.has(c.pausedReason) && c.pausedUntil === null;

// --- owner decisions ---------------------------------------------------------------------------

export type Decision = "approve" | "reject";

export type DecisionRefusal = "no_office" | "not_found" | "decided" | "expired" | "paused";

/** Shown wherever the owner decides, so the web panel and the Telegram card say the same thing. */
export const REFUSAL_TEXT: Record<DecisionRefusal, string> = {
  no_office: "The office is not enabled for this account",
  not_found: "Proposal not found",
  decided: "This proposal was already decided",
  expired: "This proposal expired",
  paused: "The office is paused; nothing can be approved",
};

/**
 * Why the owner may not make `decision` now, or null when they may. Only a waiting proposal is decided; an approval
 * is refused once it expired or while the office is paused. A rejection is always allowed while it waits.
 */
export function refuseDecision(
  office: PauseFields | undefined,
  proposal: { status: ProposalStatus; expiresAt: Date } | undefined,
  decision: Decision,
  now: number,
): DecisionRefusal | null {
  if (!office) return "no_office";
  if (!proposal) return "not_found";
  if (proposal.status !== "awaiting_approval") return "decided";
  if (decision === "reject") return null;
  if (proposal.expiresAt.getTime() <= now) return "expired";
  return isPaused(office, now) ? "paused" : null;
}

/** The pause columns of an `office_config` row, in ms. */
export const pauseOf = (row: { paused: boolean; pausedReason: string | null; pausedUntil: Date | null }) => ({
  paused: row.paused,
  pausedReason: row.pausedReason,
  pausedUntil: row.pausedUntil?.getTime() ?? null,
});

/** Start of the UTC day holding `at`, so the server, the runner and the browser agree on "today". */
export function utcDayStart(at: Date | number) {
  const d = new Date(at);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export const MESSAGE_TONES = ["info", "good", "warn", "bad"] as const;
export type MessageTone = (typeof MESSAGE_TONES)[number];
