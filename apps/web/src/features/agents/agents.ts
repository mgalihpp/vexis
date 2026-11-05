// Agent domain: types, strategy templates, the seeded fleet and the pure math the pages share.
// There is no agent runtime yet, so the fleet is demo data held in `stores/agents.ts`.

export type StrategyId = "auto-rebalance" | "range-guard" | "fee-harvester";
export type AgentStatus = "live" | "paused" | "attention";
export type PositionState = "in-range" | "holding" | "out-of-range";

export interface TokenRef {
  symbol: string;
  icon: string | null;
}

export interface PoolRef {
  address: string;
  pair: string;
  feePct: number;
  binStep: number;
  tokenX: TokenRef;
  tokenY: TokenRef;
}

export interface Rules {
  cooldownMin: number;
  rangeBins: number;
  stopLossPct: number;
  maxRebalancesPerDay: number;
  lowSol: number;
}

export interface Agent {
  id: string;
  name: string;
  strategy: StrategyId;
  status: AgentStatus;
  /** Time in the current status, already formatted (`12s`, `2h`). */
  statusAge: string;
  pool: PoolRef;
  position: PositionState;
  /** Bin ids, or prices when the pool has no integer bins to show. */
  range: { lower: number; upper: number; active: number };
  valueUsd: number;
  fees24hUsd: number;
  pnl30dUsd: number;
  pnl30dPct: number;
  lastAction: string;
  lastActionAgo: string;
  rules: Rules;
}

export const STRATEGIES: { id: StrategyId; label: string; recommended?: boolean }[] = [
  {
    id: "auto-rebalance",
    label: "Auto-rebalance",
    recommended: true,
  },
  {
    id: "range-guard",
    label: "Range guard",
  },
  {
    id: "fee-harvester",
    label: "Fee harvester",
  },
];

export const strategyLabel = (id: StrategyId) => STRATEGIES.find((s) => s.id === id)?.label ?? id;

const SOL: TokenRef = {
  symbol: "SOL",
  icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
};
const USDC: TokenRef = {
  symbol: "USDC",
  icon: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
};
const JUP: TokenRef = { symbol: "JUP", icon: "https://static.jup.ag/jup/icon.png" };

export const POOLS: PoolRef[] = [
  {
    address: "BGm1tav58oGcsQJehL9WXBFXF7D27vZsKefj4xJKD5Y",
    pair: "SOL/USDC",
    feePct: 0.05,
    binStep: 4,
    tokenX: SOL,
    tokenY: USDC,
  },
  {
    address: "5rCf1DM8LjKTw4YqhnoLcngyZYeNnQqztScTogYHAS6",
    pair: "SOL/USDC",
    feePct: 0.01,
    binStep: 1,
    tokenX: SOL,
    tokenY: USDC,
  },
  {
    address: "9d9mb8kooFfaD3SctgZtkxQypkshx6ezhbKio89ixyy2",
    pair: "JUP/SOL",
    feePct: 0.3,
    binStep: 12,
    tokenX: JUP,
    tokenY: SOL,
  },
];

const rules = (over: Partial<Rules> = {}): Rules => ({
  cooldownMin: 15,
  rangeBins: 4,
  stopLossPct: 18,
  maxRebalancesPerDay: 12,
  lowSol: 0.5,
  ...over,
});

const [SOL_USDC, SOL_USDC_FLAT, JUP_SOL] = POOLS as [PoolRef, PoolRef, PoolRef];

export const SEED_AGENTS: Agent[] = [
  {
    id: "tiang",
    name: "Tiang",
    strategy: "auto-rebalance",
    status: "live",
    statusAge: "12s",
    pool: SOL_USDC,
    position: "in-range",
    range: { lower: 182, upper: 196, active: 189 },
    valueUsd: 18_420.55,
    fees24hUsd: 42.18,
    pnl30dUsd: 1240.32,
    pnl30dPct: 7.2,
    lastAction: "Rebalanced 188 → 192",
    lastActionAgo: "6m ago",
    rules: rules(),
  },
  {
    id: "meridian",
    name: "Meridian",
    strategy: "auto-rebalance",
    status: "live",
    statusAge: "28s",
    pool: SOL_USDC,
    position: "in-range",
    range: { lower: 186, upper: 198, active: 191 },
    valueUsd: 12_480.2,
    fees24hUsd: 28.42,
    pnl30dUsd: 642.18,
    pnl30dPct: 5.4,
    lastAction: "Claimed $26.10 in fees",
    lastActionAgo: "18m ago",
    rules: rules({ rangeBins: 6, cooldownMin: 30 }),
  },
  {
    id: "nightwatch",
    name: "Nightwatch",
    strategy: "auto-rebalance",
    status: "live",
    statusAge: "41s",
    pool: JUP_SOL,
    position: "in-range",
    range: { lower: 0.00812, upper: 0.00868, active: 0.00855 },
    valueUsd: 8910.42,
    fees24hUsd: 19.06,
    pnl30dUsd: -214.8,
    pnl30dPct: -2.4,
    lastAction: "Rebalanced 0.00838 → 0.00846",
    lastActionAgo: "31m ago",
    rules: rules({ rangeBins: 12, cooldownMin: 10, stopLossPct: 25 }),
  },
  {
    id: "kestrel",
    name: "Kestrel",
    strategy: "range-guard",
    status: "paused",
    statusAge: "2h",
    pool: SOL_USDC,
    position: "holding",
    range: { lower: 180, upper: 190, active: 183 },
    valueUsd: 5280.11,
    fees24hUsd: 12.14,
    pnl30dUsd: 86.42,
    pnl30dPct: 1.6,
    lastAction: "Paused by you",
    lastActionAgo: "2h ago",
    rules: rules({ maxRebalancesPerDay: 0, stopLossPct: 10 }),
  },
  {
    id: "drift",
    name: "Drift",
    strategy: "fee-harvester",
    status: "attention",
    statusAge: "42m",
    pool: SOL_USDC_FLAT,
    position: "out-of-range",
    range: { lower: 172, upper: 182, active: 161 },
    valueUsd: 3120.36,
    fees24hUsd: 10.99,
    pnl30dUsd: -38.1,
    pnl30dPct: -1.2,
    lastAction: "Rebalance failed — slippage 1.8% > 1.0%",
    lastActionAgo: "42m ago",
    rules: rules({ rangeBins: 10, cooldownMin: 60, stopLossPct: 15 }),
  },
];

// --- fleet -------------------------------------------------------------------------------------

export type AgentFilter = "all" | "running" | "paused" | "attention";
export type AgentSort = "fees" | "value" | "pnl";

export const FILTERS: { value: AgentFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "paused", label: "Paused" },
  { value: "attention", label: "Attention" },
];

export const SORTS: { value: AgentSort; label: string }[] = [
  { value: "fees", label: "Fees 24h" },
  { value: "value", label: "Value" },
  { value: "pnl", label: "PnL 30d" },
];

const filterStatus: Record<Exclude<AgentFilter, "all">, AgentStatus> = {
  running: "live",
  paused: "paused",
  attention: "attention",
};

export function countByFilter(agents: Agent[]): Record<AgentFilter, number> {
  return {
    all: agents.length,
    running: agents.filter((a) => a.status === "live").length,
    paused: agents.filter((a) => a.status === "paused").length,
    attention: agents.filter((a) => a.status === "attention").length,
  };
}

const sortKey: Record<AgentSort, (a: Agent) => number> = {
  fees: (a) => a.fees24hUsd,
  value: (a) => a.valueUsd,
  pnl: (a) => a.pnl30dUsd,
};

export function visibleAgents(agents: Agent[], opts: { filter: AgentFilter; query: string; sort: AgentSort }) {
  const q = opts.query.trim().toLowerCase();
  return agents
    .filter((a) => opts.filter === "all" || a.status === filterStatus[opts.filter])
    .filter((a) => !q || `${a.name} ${a.pool.pair} ${strategyLabel(a.strategy)}`.toLowerCase().includes(q))
    .sort((a, b) => sortKey[opts.sort](b) - sortKey[opts.sort](a));
}

export interface FleetSummary {
  valueUsd: number;
  fees24hUsd: number;
  pnl30dUsd: number;
  /** pnl30d as a share of the value 30 days ago (value - pnl). */
  pnl30dPct: number;
  best: Agent | null;
  live: number;
  attention: number;
  inRange: number;
  total: number;
}

export function summarizeFleet(agents: Agent[]): FleetSummary {
  const valueUsd = agents.reduce((s, a) => s + a.valueUsd, 0);
  const pnl30dUsd = agents.reduce((s, a) => s + a.pnl30dUsd, 0);
  const start = valueUsd - pnl30dUsd;
  const best = agents.reduce<Agent | null>((b, a) => (!b || a.pnl30dUsd > b.pnl30dUsd ? a : b), null);
  return {
    valueUsd,
    fees24hUsd: agents.reduce((s, a) => s + a.fees24hUsd, 0),
    pnl30dUsd,
    pnl30dPct: start > 0 ? (pnl30dUsd / start) * 100 : 0,
    best,
    live: agents.filter((a) => a.status === "live").length,
    attention: agents.filter((a) => a.status === "attention").length,
    inRange: agents.filter((a) => a.position === "in-range").length,
    total: agents.length,
  };
}

export type BinSide = "y" | "active" | "x";

/** Bars drawn for a price range, which has no integer bins to count. */
const PRICE_RANGE_BARS = 24;
const MAX_BARS = 60;

/**
 * The range as one bar per bin, like the portfolio's position distribution: token Y below the active bin,
 * token X above. When the active bin is outside the range every bar is on one side and there is no tick.
 */
export function binLadder({ lower, upper, active }: Agent["range"]) {
  const count =
    Number.isInteger(lower) && Number.isInteger(upper) ? Math.min(MAX_BARS, upper - lower + 1) : PRICE_RANGE_BARS;
  if (active < lower) return { bars: Array<BinSide>(count).fill("x"), tick: null };
  if (active > upper) return { bars: Array<BinSide>(count).fill("y"), tick: null };
  const at = Math.round(((active - lower) / (upper - lower || 1)) * (count - 1));
  const bars = Array.from({ length: count }, (_, i): BinSide => (i < at ? "y" : i === at ? "active" : "x"));
  return { bars, tick: ((at + 0.5) / count) * 100 };
}

/** Bin ids print as integers, pool prices as three significant digits. */
export const formatBin = (v: number) => (Number.isInteger(v) ? String(v) : String(Number(v.toPrecision(3))));

// --- new-agent wizard --------------------------------------------------------------------------

export const WIZARD_STEPS = ["strategy", "market", "automation", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface Draft {
  strategy: StrategyId;
  name: string;
  wallet: string;
  poolAddress: string;
  depositUsd: number;
  halfBins: number;
  rangePreset: "tight" | "mid" | "wide" | "custom";
  outOfRangeMin: number;
  slippagePct: number;
  cooldownMin: number;
  maxRebalancesPerDay: number;
  stopLoss: { on: boolean; pct: number };
  lowSol: { on: boolean; sol: number };
  takeProfit: { on: boolean; pct: number };
  autoClaim: { on: boolean; aboveUsd: number };
  telegram: boolean;
  acknowledged: boolean;
  observation: boolean;
}

export const WALLET = {
  name: "Main wallet",
  address: "9xKpMxk6mXJ4v8rZ2qAYoK8nT3WcUoZk5dLq4Qm",
  sol: 12.48,
  usdc: 4200,
};
export const SPOT_USD = 182.34;

/** Most the wallet can put in: its SOL at spot plus its USDC. */
export const WALLET_MAX_USD = () => WALLET.sol * SPOT_USD + WALLET.usdc;
export const NETWORK_FEE_SOL = 0.0004;
export const POSITION_RENT_SOL = 0.057;
export const REBALANCE_COST_USD = 0.07;

export const RANGE_PRESETS = [
  { id: "tight", label: "±0.3%", halfBins: 4 },
  { id: "mid", label: "±0.6%", halfBins: 7 },
  { id: "wide", label: "±1.5%", halfBins: 19 },
] as const;

export const defaultDraft = (name = "Tiang"): Draft => ({
  strategy: "auto-rebalance",
  name,
  wallet: WALLET.address,
  poolAddress: POOLS[0]?.address ?? "",
  depositUsd: 6000,
  halfBins: 7,
  rangePreset: "mid",
  outOfRangeMin: 15,
  slippagePct: 1,
  cooldownMin: 30,
  maxRebalancesPerDay: 12,
  stopLoss: { on: true, pct: 18 },
  lowSol: { on: true, sol: 0.5 },
  takeProfit: { on: false, pct: 25 },
  autoClaim: { on: true, aboveUsd: 25 },
  telegram: true,
  acknowledged: false,
  observation: true,
});

export const draftPool = (d: Draft) => POOLS.find((p) => p.address === d.poolAddress) ?? (POOLS[0] as PoolRef);

/** Active bin of the demo pool; the range is drawn around it. */
export const ACTIVE_BIN = 189;

export function draftRange(d: Draft) {
  const pool = draftPool(d);
  const lower = ACTIVE_BIN - d.halfBins;
  const upper = ACTIVE_BIN + d.halfBins;
  const bins = upper - lower;
  return { lower, upper, bins, widthPct: (bins * pool.binStep) / 100 };
}

/** Prices at the range edges, from the spot price and the bin step (each bin is `binStep` bp). */
export function binPrice(bin: number, binStepBp: number) {
  return SPOT_USD * (1 + binStepBp / 10_000) ** (bin - ACTIVE_BIN);
}

/** Splits the deposit between the two tokens by where the active bin sits in the range. */
export function positionEstimate(d: Draft) {
  const { lower, upper } = draftRange(d);
  const solShare = (upper - ACTIVE_BIN) / (upper - lower);
  const solUsd = d.depositUsd * solShare;
  return { solShare, sol: solUsd / SPOT_USD, solUsd, usdc: d.depositUsd - solUsd };
}

export type Risk = "Conservative" | "Balanced" | "Aggressive";

export function guardrailRisk(d: Draft): Risk {
  if (!d.stopLoss.on) return "Aggressive";
  if (d.stopLoss.pct <= 10) return "Conservative";
  return d.stopLoss.pct <= 20 ? "Balanced" : "Aggressive";
}

export const enabledGuardrails = (d: Draft) => [d.stopLoss.on, d.lowSol.on, d.takeProfit.on].filter(Boolean).length;

export function draftIssues(d: Draft): string[] {
  const issues: string[] = [];
  if (!d.name.trim()) issues.push("Name your agent");
  if (d.depositUsd <= 0) issues.push("Enter a deposit");
  if (d.depositUsd > WALLET_MAX_USD()) issues.push("Deposit is larger than the wallet balance");
  if (d.halfBins < 1) issues.push("Range needs at least one bin each side");
  return issues;
}

/** Turns a finished draft into a live-in-observation agent for the fleet. */
export function agentFromDraft(d: Draft, id: string): Agent {
  const pool = draftPool(d);
  const { lower, upper } = draftRange(d);
  return {
    id,
    name: d.name.trim(),
    strategy: d.strategy,
    status: d.observation ? "paused" : "live",
    statusAge: "0s",
    pool,
    position: "in-range",
    range: { lower, upper, active: ACTIVE_BIN },
    valueUsd: d.depositUsd,
    fees24hUsd: 0,
    pnl30dUsd: 0,
    pnl30dPct: 0,
    lastAction: d.observation ? "Started in observation mode" : "Launched",
    lastActionAgo: "just now",
    rules: {
      cooldownMin: d.cooldownMin,
      rangeBins: d.halfBins,
      stopLossPct: d.stopLoss.on ? d.stopLoss.pct : 0,
      maxRebalancesPerDay: d.maxRebalancesPerDay,
      lowSol: d.lowSol.on ? d.lowSol.sol : 0,
    },
  };
}

/** Unique, URL-safe id from the name; a numeric suffix keeps it unique within the fleet. */
export function uniqueId(name: string, taken: string[]) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "agent";
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// --- detail ------------------------------------------------------------------------------------

/** Deterministic daily PnL curve ending at the agent's 30d PnL, so SSR and hydration draw the same line. */
export function pnlSeries(agent: Agent, days: number) {
  let seed = [...agent.id].reduce((s, c) => s + c.charCodeAt(0), 7);
  const noise = () => {
    seed = (seed * 9301 + 49_297) % 233_280;
    return seed / 233_280 - 0.5;
  };
  const target = agent.pnl30dUsd * (days / 30);
  const points: number[] = [];
  for (let i = 0; i <= days; i++) {
    const t = i / days;
    points.push(target * t + noise() * Math.abs(target) * 0.18 * Math.sin(Math.PI * t));
  }
  points[points.length - 1] = target;
  return points;
}
