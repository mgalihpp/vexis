import type { GuardrailCheck, Guardrails, KeySource, ProposalParams } from "@vexis/db/office";
import { alertable, type FilterPool, type PoolFilter } from "@vexis/db/screen";

/** Everything the code checks read about one open proposal, gathered by the runtime. */
export type RiskFacts = {
  readonly params: ProposalParams<"open">;
  /** Native SOL in the wallet now; null when it could not be read. */
  readonly walletSol: number | null;
  /** The wallet's SOL at the first read of this UTC day; null when unknown. */
  readonly dayStartSol: number | null;
  /** Open office journal rows. */
  readonly openPositions: number;
  /** The pool's screener row; null when it is not on the screener list (or the list is unknown). */
  readonly pool: FilterPool | null;
  /** One of the user's auto-rebalance agents manages this pool. */
  readonly rebalanceManaged: boolean;
  readonly lastExecutionAt: Date | null;
  readonly now: number;
  /** LLM spend today for the office's key source, and the cap for it. */
  readonly llmSpentUsd: number;
  readonly llmCapUsd: number;
};

const sol = (n: number) => `${n.toFixed(3)} SOL`;
const pct = (n: number) => `${n.toFixed(1)}%`;

/** Loss since the start of the UTC day, in percent of the day's starting balance. 0 for a gain or an unknown start. */
export function dailyLossPct(dayStartSol: number | null, walletSol: number | null) {
  if (dayStartSol === null || walletSol === null || dayStartSol <= 0) return 0;
  return Math.max(0, ((dayStartSol - walletSol) / dayStartSol) * 100);
}

/** The loss that pauses the office: reaching the limit counts. */
export const dailyLossHit = (g: Guardrails, dayStartSol: number | null, walletSol: number | null) =>
  dailyLossPct(dayStartSol, walletSol) >= g.maxDailyLossPct;

/** The day's LLM cap for the office's key source: the admin's for Vexis keys, the owner's for their own. */
export const dailyCapUsd = (keySource: KeySource, vexisDailyUsd: number, g: Guardrails) =>
  keySource === "vexis" ? vexisDailyUsd : g.dailyLlmUsd;

export const budgetLeft = (spentUsd: number, capUsd: number) => spentUsd < capUsd;

/**
 * Every hard rule for an `open` proposal. A rule that cannot be evaluated (wallet unread, pool unknown) fails: the
 * code never guesses in the proposal's favor. The proposal passes only when every check is ok.
 */
export function checkOpen(g: Guardrails, filter: PoolFilter, f: RiskFacts): GuardrailCheck[] {
  const { amountSol } = f.params;
  const wallet = f.walletSol;
  const cap = wallet === null ? null : (wallet * g.maxPositionPct) / 100;
  const loss = dailyLossPct(f.dayStartSol, wallet);
  const sinceMs = f.lastExecutionAt === null ? null : f.now - f.lastExecutionAt.getTime();
  return [
    {
      rule: "max_position_pct",
      ok: cap !== null && amountSol <= cap,
      value: cap === null ? "wallet unread" : `${sol(amountSol)} of max ${sol(cap)} (${g.maxPositionPct}%)`,
    },
    {
      rule: "sol_reserve",
      ok: wallet !== null && wallet - amountSol >= g.solReserve,
      value: wallet === null ? "wallet unread" : `${sol(wallet - amountSol)} left, reserve ${sol(g.solReserve)}`,
    },
    {
      rule: "max_active_positions",
      ok: f.openPositions < g.maxActivePositions,
      value: `${f.openPositions} open of ${g.maxActivePositions}`,
    },
    {
      rule: "daily_loss",
      ok: wallet !== null && f.dayStartSol !== null && loss < g.maxDailyLossPct,
      value:
        wallet === null || f.dayStartSol === null ? "balance unknown" : `${pct(loss)} of max ${pct(g.maxDailyLossPct)}`,
    },
    {
      rule: "pool_alertable",
      ok: f.pool !== null && alertable(f.pool, filter),
      value: poolVerdict(f.pool, filter),
    },
    {
      rule: "not_rebalance_managed",
      ok: !f.rebalanceManaged,
      value: f.rebalanceManaged ? "an auto-rebalance agent manages this pool" : "free",
    },
    {
      rule: "cooldown",
      ok: sinceMs === null || sinceMs >= g.cooldownSec * 1000,
      value:
        sinceMs === null ? "no execution yet" : `${Math.floor(sinceMs / 1000)}s since last, needs ${g.cooldownSec}s`,
    },
    {
      rule: "llm_budget",
      ok: budgetLeft(f.llmSpentUsd, f.llmCapUsd),
      value: `$${f.llmSpentUsd.toFixed(4)} of $${f.llmCapUsd.toFixed(2)} today`,
    },
  ];
}

function poolVerdict(pool: FilterPool | null, filter: PoolFilter) {
  if (pool === null) return "not on the screener list";
  if (pool.blacklisted) return "blacklisted";
  if (pool.freezable) return "freeze authority held";
  return alertable(pool, filter) ? "passes the screen" : "outside the screen";
}
