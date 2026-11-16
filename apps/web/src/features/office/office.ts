import {
  ADMIN_STOP,
  DAILY_LOSS,
  type Decider,
  EXECUTION_FAILING,
  type Guardrails,
  isPaused,
  type KeySource,
  KILL_SWITCH,
  LLM_AGENTS,
  type LlmAgent,
  type LlmProvider,
  type MessageTone,
  MODEL_PRICES,
  OFFICE_AGENTS,
  type OfficeAgent,
  type OfficeMode,
  type OfficeModels,
  type OfficeScreen,
  ownerCanResume,
  type PauseFields,
  type ProposalKind,
  type ProposalParams,
  type ProposalStatus,
  type Proposer,
  type RiskNotes,
  type WalletSource,
} from "@vexis/shared/office";
import { money } from "@/features/portfolio/money";
import { LIVE_MS } from "@/lib/query";

// The office page's view logic: what each desk is doing, what the owner may still do, and the numbers in the
// summary. Pure, so the rules are tested without a database or a browser.

// --- data the server sends --------------------------------------------------------------------

type ProposalDetail = { [K in ProposalKind]: { kind: K; params: ProposalParams<K> | null } }[ProposalKind];

/** `params` and `risk` are null when the stored jsonb no longer parses; the card shows a dash for them. */
export type ProposalView = ProposalDetail & {
  id: string;
  status: ProposalStatus;
  poolAddress: string;
  poolName: string | null;
  rationale: string;
  summary: string | null;
  proposedBy: Proposer;
  decidedBy: Decider | null;
  risk: RiskNotes | null;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
};

export type MessageView = {
  id: string;
  agent: OfficeAgent;
  text: string;
  tone: MessageTone | null;
  poolAddress: string | null;
  proposalId: string | null;
  at: number;
};

export type RunView = {
  agent: LlmAgent;
  provider: LlmProvider;
  model: string;
  /** The prompt version this call ran, so a behavior change traces back to a prompt change. */
  promptVersion: string;
  /** Null when the call failed before the provider reported usage. */
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number;
  error: string | null;
  at: number;
};

/** The last exchange with one LLM desk: the two messages it was sent, the raw answer and that call's metadata. */
export type ThreadView = {
  agent: LlmAgent;
  provider: LlmProvider;
  model: string;
  keySource: KeySource;
  promptVersion: string;
  /** The system message exactly as sent. */
  system: string;
  /** The user message: this tick's pools, wallet and proposal. */
  user: string;
  /** The answer exactly as the provider sent it; null when the call failed before one arrived. */
  reply: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  durationMs: number;
  error: string | null;
  at: number;
};

/** An open position from the journal. */
export type PositionView = {
  id: string;
  poolAddress: string;
  poolName: string | null;
  simulated: boolean;
  amountSol: number;
  amountUsd: number | null;
  /** The Monitor's last on-chain value in SOL; null for a simulated position or before the first read. */
  valueSol: number | null;
  openReason: string;
  openedAt: number;
};

/** A sum of PnL; null when no position in it has a known PnL. */
export type Amount = { sol: number | null; usd: number | null };

export type SpendRow = {
  agent: LlmAgent;
  provider: LlmProvider;
  model: string;
  keySource: KeySource;
  usd: number;
  runs: number;
};

export type ConfigView = PauseFields & {
  mode: OfficeMode;
  /** Live signs and sends approved proposals; Preview (false) simulates them. */
  live: boolean;
  guardrails: Guardrails;
  models: OfficeModels;
  keySource: KeySource;
  vexisDailyUsd: number;
  /** Providers with a saved own key. The keys themselves never leave the server. */
  savedKeys: LlmProvider[];
  walletSource: WalletSource;
  /** The auto-rebalance agent wallet, when the user has one. */
  userWallet: { publicKey: string; rpcHost: string | null } | null;
  /** The office's own wallet, when one was saved. */
  officeWallet: { publicKey: string; rpcHost: string | null } | null;
  /** Which screener pools the office scouts: a preset, or the custom filter the screener handed over. */
  screen: OfficeScreen;
};

export type OfficeData =
  | { enabled: false }
  | {
      enabled: true;
      now: number;
      config: ConfigView;
      proposals: ProposalView[];
      messages: MessageView[];
      runs: RunView[];
      /** Each desk's last exchange, one row per desk; the newest call replaces it. */
      threads: ThreadView[];
      positions: PositionView[];
      /** Realized PnL of closed positions, today (UTC) and all time. */
      pnl: { today: Amount; total: Amount };
      spend: SpendRow[];
      /** Proposals that reached each status today (UTC). */
      today: Partial<Record<ProposalStatus, number>>;
    };

export type OfficeView = Extract<OfficeData, { enabled: true }>;

// --- the floor --------------------------------------------------------------------------------

export const AGENT_INFO: Record<OfficeAgent, { name: string; role: string }> = {
  scout: { name: "Scout", role: "Finds candidate pools on the screener list" },
  strategist: { name: "Strategist", role: "Drafts the strategy, range and size" },
  risk: { name: "Risk Manager", role: "Guardrails in code plus an LLM note; can veto" },
  manager: { name: "Manager", role: "Summarizes proposals and asks for approval" },
  monitor: { name: "Monitor", role: "Watches positions: out of range, take profit, stop loss" },
  executor: { name: "Executor", role: "The only one that executes; simulation only in the MVP" },
  bookkeeper: { name: "Bookkeeper", role: "Writes each position's PnL to the journal" },
};

export const isLlmAgent = (agent: OfficeAgent): agent is LlmAgent => (LLM_AGENTS as readonly string[]).includes(agent);

export type DeskStatus = "idle" | "thinking" | "waiting" | "error" | "off";

export const DESK_LABEL: Record<DeskStatus, string> = {
  idle: "Idle",
  thinking: "Thinking",
  waiting: "Waiting for approval",
  error: "Error",
  off: "Not running",
};

/** A run or a code agent's message this recent counts as work in flight. */
export const RECENT_MS = 90_000;
/** A message stays in its speech bubble this long. */
export const BUBBLE_MS = 120_000;

/** Which desk holds a proposal while it sits in each open status. */
const HOLDER: Partial<Record<ProposalStatus, OfficeAgent>> = {
  draft: "risk",
  risk_checked: "manager",
  approved: "executor",
  executing: "executor",
};

const latestBy = <T extends { at: number }, K extends string>(rows: readonly T[], key: (row: T) => K) => {
  const out = new Map<K, T>();
  for (const row of rows) {
    const k = key(row);
    const seen = out.get(k);
    if (!seen || row.at > seen.at) out.set(k, row);
  }
  return out;
};

/**
 * Each desk's status, first match wins: a paused office is error everywhere; an LLM agent with no model is off,
 * and errored when its latest run failed; the Manager waits while a proposal awaits approval; a desk that holds a
 * proposal, or whose agent ran (or, for code agents, spoke) within `RECENT_MS`, is thinking; else idle.
 */
export function deskStatuses(view: OfficeView, now: number): Record<OfficeAgent, DeskStatus> {
  const stopped = pauseView(view.config, now).state === "paused";
  const runs = latestBy(view.runs, (r) => r.agent);
  const said = latestBy(view.messages, (m) => m.agent);
  const holding = new Set(view.proposals.flatMap((p) => HOLDER[p.status] ?? []));
  const awaiting = view.proposals.some((p) => p.status === "awaiting_approval");

  const status = (agent: OfficeAgent): DeskStatus => {
    if (stopped) return "error";
    if (isLlmAgent(agent)) {
      if (!view.config.models[agent]) return "off";
      if (runs.get(agent)?.error) return "error";
    }
    if (agent === "manager" && awaiting) return "waiting";
    if (holding.has(agent)) return "thinking";
    const last = isLlmAgent(agent) ? runs.get(agent) : said.get(agent);
    if (last && now - last.at < RECENT_MS) return "thinking";
    return "idle";
  };
  return Object.fromEntries(OFFICE_AGENTS.map((a) => [a, status(a)])) as Record<OfficeAgent, DeskStatus>;
}

/** Each agent's latest message, if it is recent enough for a speech bubble. */
export function bubbles(messages: readonly MessageView[], now: number) {
  const latest = latestBy(messages, (m) => m.agent);
  return Object.fromEntries([...latest].filter(([, m]) => now - m.at < BUBBLE_MS && m.at <= now + 5_000)) as Partial<
    Record<OfficeAgent, MessageView>
  >;
}

export type Errand = "screen" | "terminal" | "cabinet";

/**
 * The walk a new message starts (decoration only): a colleague brings the paper over to an LLM agent that just
 * spoke, and a code agent goes to its own machine.
 */
const WALK: Record<OfficeAgent, { walker: OfficeAgent; to: OfficeAgent | Errand } | null> = {
  scout: null,
  strategist: { walker: "scout", to: "strategist" },
  risk: { walker: "strategist", to: "risk" },
  manager: { walker: "risk", to: "manager" },
  monitor: { walker: "monitor", to: "screen" },
  executor: { walker: "executor", to: "terminal" },
  bookkeeper: { walker: "bookkeeper", to: "cabinet" },
};

/** The walks to play for messages not in `seen`, oldest first. */
export function walks(seen: ReadonlySet<string>, messages: readonly MessageView[]) {
  return messages
    .filter((m) => !seen.has(m.id))
    .sort((a, b) => a.at - b.at)
    .flatMap((m) => {
      const w = WALK[m.agent];
      return w ? [w] : [];
    });
}

// --- approvals --------------------------------------------------------------------------------

/** Proposals waiting for the owner, the one expiring first on top; expired ones (the runtime has not caught up) last. */
export const waitingProposals = (proposals: readonly ProposalView[], now: number) =>
  proposals
    .filter((p) => p.status === "awaiting_approval")
    .sort((a, b) => Number(a.expiresAt <= now) - Number(b.expiresAt <= now) || a.expiresAt - b.expiresAt);

const pad = (n: number) => String(n).padStart(2, "0");

/** `14:05`, `1:02:09` from an hour up, and `share` of the window left; `expired` once `expiresAt` passed. */
export function countdown(p: { createdAt: number; expiresAt: number }, now: number) {
  const left = p.expiresAt - now;
  if (left <= 0) return { expired: true, text: "expired", share: 0 };
  const s = Math.ceil(left / 1000);
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  const text = h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  const span = p.expiresAt - p.createdAt;
  return { expired: false, text, share: span > 0 ? Math.min(1, left / span) : 0 };
}

export const KIND_LABEL: Record<ProposalKind, string> = {
  open: "Open position",
  rebalance: "Rebalance",
  claim: "Claim fees",
  close: "Close position",
};

const CLOSE_REASON: Record<ProposalParams<"close">["reason"], string> = {
  take_profit: "take profit",
  stop_loss: "stop loss",
  out_of_range: "out of range",
  manual: "manual",
};

const DASH = "—";
const sol = (v: number) => money(v, "sol");
const usd = (v: number) => money(v, "usd");

/** The key/value grid of an approval card. A value the proposal does not carry is a dash. */
export function proposalFacts(p: ProposalView): { label: string; value: string; sub?: string }[] {
  const facts = [
    { label: "Action", value: KIND_LABEL[p.kind] },
    { label: "Pool", value: p.poolName ?? `${p.poolAddress.slice(0, 4)}…${p.poolAddress.slice(-4)}` },
  ];
  switch (p.kind) {
    case "open": {
      const x = p.params;
      return [
        ...facts,
        { label: "Strategy", value: x?.strategy ?? DASH },
        {
          label: "Range (bin)",
          value: x ? `${x.lowerBin} … ${x.upperBin}` : DASH,
          sub: x ? `active ${x.activeBin}` : "",
        },
        {
          label: "Amount",
          value: x ? sol(x.amountSol) : DASH,
          sub: x?.solUsd ? usd(x.amountSol * x.solUsd) : DASH,
        },
      ];
    }
    case "rebalance": {
      const x = p.params;
      return [
        ...facts,
        { label: "Strategy", value: x?.strategy ?? DASH },
        {
          label: "New range (bin)",
          value: x ? `${x.lowerBin} … ${x.upperBin}` : DASH,
          sub: x ? `active ${x.activeBin}` : "",
        },
      ];
    }
    case "claim":
      return [...facts, { label: "Fee", value: p.params?.feeSol != null ? sol(p.params.feeSol) : DASH, sub: DASH }];
    case "close":
      return [...facts, { label: "Reason", value: p.params ? CLOSE_REASON[p.params.reason] : DASH }];
  }
}

// --- pauses -----------------------------------------------------------------------------------

const PAUSE_TEXT: Record<string, string> = {
  [KILL_SWITCH]: "Kill switch pressed. Every agent stopped and proposals not yet executing were rejected.",
  [DAILY_LOSS]: "Today's loss passed the daily limit.",
  [EXECUTION_FAILING]: "Executions failed several times in a row.",
  [ADMIN_STOP]: "Stopped by a Vexis admin. Ask an admin to start it again.",
};

export type PauseView =
  | { state: "running" }
  | { state: "paused"; reason: string | null; text: string; until: number | null; canResume: boolean };

/** A pause whose `pausedUntil` passed has cleared itself. */
export function pauseView(c: PauseFields, now: number): PauseView {
  if (!isPaused(c, now)) return { state: "running" };
  const reason = c.pausedReason;
  const known = reason ? PAUSE_TEXT[reason] : undefined;
  const text = known ?? (reason ? `Paused (${reason}).` : "Paused.");
  return { state: "paused", reason, text, until: c.pausedUntil, canResume: ownerCanResume(c) };
}

// --- summary ----------------------------------------------------------------------------------

/** What the open positions hold. USD is unknown as soon as one position has no USD amount. */
export function deployed(positions: readonly PositionView[]): { sol: number; usd: number | null } {
  return {
    sol: positions.reduce((a, j) => a + j.amountSol, 0),
    usd: positions.every((j) => j.amountUsd !== null) ? positions.reduce((a, j) => a + (j.amountUsd ?? 0), 0) : null,
  };
}

/** LLM spend today per key source against its cap: the admin's for Vexis keys, the owner's guardrail for own keys. */
export function spendVsCap(spend: readonly SpendRow[], config: Pick<ConfigView, "vexisDailyUsd" | "guardrails">) {
  const total = (source: KeySource) => spend.filter((r) => r.keySource === source).reduce((a, r) => a + r.usd, 0);
  const meter = (usd: number, cap: number) => ({ usd, cap, share: cap > 0 ? Math.min(1, usd / cap) : usd > 0 ? 1 : 0 });
  return {
    vexis: meter(total("vexis"), config.vexisDailyUsd),
    own: meter(total("own"), config.guardrails.dailyLlmUsd),
  };
}

/** A model whose listed price is zero, so its calls bill nothing and never use up the cap. */
export const freeModel = (m: { provider: LlmProvider; model: string }) => {
  const price = MODEL_PRICES[m.provider][m.model];
  return price !== undefined && price.input === 0 && price.output === 0;
};

/** Token counts read the same on the server and in the browser. */
export const tokenCount = (n: number) => n.toLocaleString("en-US");

/**
 * A reply as indented JSON, since a desk answers with one object; anything else (a refusal, a truncated answer) stays
 * exactly as it arrived. Same input, same output, so the server and the browser render it alike.
 */
export function prettyReply(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) return text;
  try {
    return JSON.stringify(JSON.parse(text.slice(start, end + 1)), null, 2);
  } catch {
    return text;
  }
}

export type DeskUsage = {
  agent: LlmAgent;
  model: OfficeModels[LlmAgent];
  /** Calls made today (UTC) and what they cost. */
  runs: number;
  usd: number;
  free: boolean;
};

/** What each LLM desk ran on today: its model, its calls and their spend. Desks with no model show as off. */
export function deskUsage(spend: readonly SpendRow[], models: OfficeModels): DeskUsage[] {
  return LLM_AGENTS.map((agent) => {
    const rows = spend.filter((r) => r.agent === agent);
    const model = models[agent];
    return {
      agent,
      model,
      runs: rows.reduce((n, r) => n + r.runs, 0),
      usd: rows.reduce((n, r) => n + r.usd, 0),
      free: model !== null && freeModel(model),
    };
  });
}

/** LLM agents whose provider needs an own key that was not saved. */
export function missingKeys(config: Pick<ConfigView, "keySource" | "models" | "savedKeys">) {
  if (config.keySource !== "own") return [];
  return LLM_AGENTS.flatMap((agent) => {
    const m = config.models[agent];
    return m && !config.savedKeys.includes(m.provider) ? [{ agent, provider: m.provider }] : [];
  });
}

/** Pools the feed can be filtered by, named when any row knows the name. */
export function knownPools(view: Pick<OfficeView, "proposals" | "positions" | "messages">) {
  const names = new Map<string, string | null>();
  for (const row of [...view.proposals, ...view.positions]) {
    if (!names.get(row.poolAddress)) names.set(row.poolAddress, row.poolName);
  }
  for (const m of view.messages) if (m.poolAddress && !names.has(m.poolAddress)) names.set(m.poolAddress, null);
  return [...names].map(([address, name]) => ({ address, name }));
}

export const POLL_FAST_MS = 2000;

/** Poll every 2 s while something is being executed, else at the live pace. */
export const pollMs = (data: OfficeData | undefined) =>
  data?.enabled && data.proposals.some((p) => p.status === "approved" || p.status === "executing")
    ? POLL_FAST_MS
    : LIVE_MS;
