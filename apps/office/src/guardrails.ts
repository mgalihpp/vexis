import type { GuardrailCheck, Guardrails, KeySource, ProposalParams } from "@vexis/db/office";
import { alertable, type FilterPool, type PoolFilter } from "@vexis/db/screen";

/** An office journal row as the money rules read it. */
export type BookPosition = {
  readonly amountSol: number;
  /** A simulated position never took SOL from the wallet and never makes or loses any. */
  readonly simulated: boolean;
  /** Last on-chain value of an open position in SOL, fees included, and when it was read. */
  readonly valueSol: number | null;
  readonly valuedAt: Date | null;
  /** Realized PnL of a closed position; null until the Bookkeeper fills it. */
  readonly pnlSol: number | null;
};

/** The office's own positions, read once a tick. */
export type Book = {
  readonly open: ReadonlyArray<BookPosition>;
  /** Positions closed since the start of the UTC day. */
  readonly closedToday: ReadonlyArray<BookPosition>;
};

/** Everything the code checks read about one open proposal, gathered by the runtime. */
export type RiskFacts = {
  readonly params: ProposalParams<"open">;
  /** Native SOL in the wallet now; null when it could not be read. */
  readonly walletSol: number | null;
  /** The office's capital at the first read of this UTC day (`officeCapital`); null when unknown. */
  readonly dayStartCapital: number | null;
  readonly book: Book;
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
const sum = (xs: ReadonlyArray<number>) => xs.reduce((a, b) => a + b, 0);

/** An open position's value is trusted this long; the Monitor reads it every minute. */
export const VALUE_FRESH_MS = 5 * 60_000;

/** Native SOL the office may still spend: a simulated position acts as if it had taken its SOL. */
export const freeSol = (walletSol: number, open: ReadonlyArray<BookPosition>) =>
  walletSol - sum(open.filter((p) => p.simulated).map((p) => p.amountSol));

/** Free SOL plus what the office's real open positions cost: the base for position size and daily loss. */
export const officeCapital = (walletSol: number, open: ReadonlyArray<BookPosition>) =>
  walletSol + sum(open.filter((p) => !p.simulated).map((p) => p.amountSol));

/**
 * The office's PnL today in SOL: realized on positions closed today plus unrealized on open ones (value minus cost).
 * Simulated positions count zero. Null when any real position's number is missing or its value is stale, so an
 * unknown never reads as no loss.
 */
export function dayPnlSol(book: Book, now: number): number | null {
  const real = (ps: ReadonlyArray<BookPosition>) => ps.filter((p) => !p.simulated);
  const realized = real(book.closedToday).map((p) => p.pnlSol);
  const unrealized = real(book.open).map((p) =>
    p.valueSol === null || p.valuedAt === null || now - p.valuedAt.getTime() > VALUE_FRESH_MS
      ? null
      : p.valueSol - p.amountSol,
  );
  const all = [...realized, ...unrealized];
  return all.some((n) => n === null) ? null : sum(all as number[]);
}

/** Loss today in percent of the day's starting capital; 0 for a gain, null when either side is unknown. */
export function dailyLossPct(dayStartCapital: number | null, pnlSol: number | null) {
  if (dayStartCapital === null || pnlSol === null || dayStartCapital <= 0) return null;
  return Math.max(0, (-pnlSol / dayStartCapital) * 100);
}

/** The loss that pauses the office: reaching the limit counts. An unknown loss never pauses, it only vetoes. */
export const dailyLossHit = (g: Guardrails, lossPct: number | null) => lossPct !== null && lossPct >= g.maxDailyLossPct;

/** The day's LLM cap for the office's key source: the admin's for Vexis keys, the owner's for their own. */
export const dailyCapUsd = (keySource: KeySource, vexisDailyUsd: number, g: Guardrails) =>
  keySource === "vexis" ? vexisDailyUsd : g.dailyLlmUsd;

export const budgetLeft = (spentUsd: number, capUsd: number) => spentUsd < capUsd;

/**
 * Every hard rule for an `open` proposal. A rule that cannot be evaluated (wallet unread, pool unknown) fails: the
 * code never guesses in the proposal's favor. The proposal passes only when every check is ok.
 */
export function checkOpen(g: Guardrails, filter: PoolFilter | null, f: RiskFacts): GuardrailCheck[] {
  const { amountSol } = f.params;
  const { open } = f.book;
  const free = f.walletSol === null ? null : freeSol(f.walletSol, open);
  const cap = f.walletSol === null ? null : (officeCapital(f.walletSol, open) * g.maxPositionPct) / 100;
  const loss = dailyLossPct(f.dayStartCapital, dayPnlSol(f.book, f.now));
  const sinceMs = f.lastExecutionAt === null ? null : f.now - f.lastExecutionAt.getTime();
  return [
    {
      rule: "max_position_pct",
      ok: cap !== null && amountSol <= cap,
      value: cap === null ? "wallet unread" : `${sol(amountSol)} of max ${sol(cap)} (${g.maxPositionPct}%)`,
    },
    {
      rule: "sol_reserve",
      ok: free !== null && free - amountSol >= g.solReserve,
      value: free === null ? "wallet unread" : `${sol(free - amountSol)} left, reserve ${sol(g.solReserve)}`,
    },
    {
      rule: "max_active_positions",
      ok: open.length < g.maxActivePositions,
      value: `${open.length} open of ${g.maxActivePositions}`,
    },
    {
      rule: "daily_loss",
      ok: loss !== null && loss < g.maxDailyLossPct,
      value: loss === null ? "PnL or capital unknown" : `${pct(loss)} of max ${pct(g.maxDailyLossPct)}`,
    },
    {
      rule: "pool_alertable",
      ok: f.pool !== null && filter !== null && alertable(f.pool, filter),
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

function poolVerdict(pool: FilterPool | null, filter: PoolFilter | null) {
  if (filter === null) return "no pool filter";
  if (pool === null) return "not on the screener list";
  if (pool.blacklisted) return "blacklisted";
  if (pool.freezable) return "freeze authority held";
  if (filter.minOrganic > 0 && pool.baseOrganic === null) return "organic score unknown";
  return alertable(pool, filter) ? "passes the screen" : "outside the screen";
}
