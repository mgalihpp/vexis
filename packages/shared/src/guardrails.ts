import {
  type GuardrailCheck,
  type Guardrails,
  type KeySource,
  type ProposalKind,
  type ProposalParams,
  utcDayStart,
} from "./office.ts";
import { alertable, type FilterPool, type PoolFilter } from "./screen.ts";

// The office's hard rules, in code. The office runtime's Risk Manager runs them on every draft and the runner's
// Executor runs them again right before it signs. A rule that cannot be evaluated fails.

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

/** What the money rules read, gathered by whichever runtime checks. */
export type MoneyFacts = {
  /** Native SOL in the wallet now; null when it could not be read. */
  readonly walletSol: number | null;
  /**
   * Rent a new position account takes, read on chain (`positionRentSol` in `@vexis/shared/open-cost`): the cost
   * of every slot whose range is not chosen yet. Null when unread, which fails every rule that spends SOL.
   */
  readonly positionRentSol: number | null;
  /** The office's capital at the first read of this UTC day (`officeCapital`); null when unknown. */
  readonly dayStartCapital: number | null;
  readonly book: Book;
  /** One of the user's auto-rebalance agents manages this pool. */
  readonly rebalanceManaged: boolean;
  /** When the pool last had an execution finish. */
  readonly lastExecutionAt: Date | null;
  readonly now: number;
};

/** Everything the code checks read about one open proposal. */
export type RiskFacts = MoneyFacts & {
  readonly params: ProposalParams<"open">;
  /** The pool's screener row; null when it is not on the screener list (or the list is unknown). */
  readonly pool: FilterPool | null;
  /** LLM spend today for the office's key source, and the cap for it. */
  readonly llmSpentUsd: number;
  readonly llmCapUsd: number;
};

const sol = (n: number) => `${n.toFixed(3)} SOL`;
const pct = (n: number) => `${n.toFixed(1)}%`;
const sum = (xs: ReadonlyArray<number>) => xs.reduce((a, b) => a + b, 0);

/** An open position's value is trusted this long; the Monitor reads it every minute. */
export const VALUE_FRESH_MS = 5 * 60_000;

/** What one open is expected to take beyond its deposit before its range is chosen: rent plus the fee buffer. */
export const slotOverheadSol = (g: Guardrails, positionRentSol: number) => positionRentSol + g.txFeeBufferSol;

/** Native SOL the office may still spend: a simulated position acts as if it had taken its SOL, rent and fees. */
export const freeSol = (walletSol: number, open: ReadonlyArray<BookPosition>, overheadSol: number) =>
  walletSol - sum(open.filter((p) => p.simulated).map((p) => p.amountSol + overheadSol));

/** Free SOL plus what the office's real open positions cost: the base for position size and daily loss. */
export const officeCapital = (walletSol: number, open: ReadonlyArray<BookPosition>) =>
  walletSol + sum(open.filter((p) => !p.simulated).map((p) => p.amountSol));

/**
 * The largest deposit the office can open now: the owner's share of capital, and no more than an even split of the
 * SOL above the reserve over every slot still free, after this open's setup and fee buffer and every other free
 * slot's rent and fee buffer, so the last slot still fits. `setupSol` is this open's on-chain quote, or the position
 * rent while its range is not chosen. Null when the wallet or the rent is unread.
 */
export function positionBudget(
  g: Guardrails,
  f: Pick<MoneyFacts, "walletSol" | "positionRentSol" | "book">,
  setupSol: number | null = f.positionRentSol,
) {
  const { walletSol, positionRentSol } = f;
  if (walletSol === null || positionRentSol === null || setupSol === null) return null;
  const open = f.book.open;
  const slots = g.maxActivePositions - open.length;
  if (slots <= 0) return 0;
  const overhead = slotOverheadSol(g, positionRentSol);
  const shareCap = (officeCapital(walletSol, open) * g.maxPositionPct) / 100;
  const spendable =
    freeSol(walletSol, open, overhead) - g.solReserve - setupSol - g.txFeeBufferSol - (slots - 1) * overhead;
  return Math.max(0, Math.min(shareCap, spendable / slots));
}

/** Free SOL once this open's deposit, setup and fee buffer are paid; null when any of them is unknown. */
function leftAfterOpen(g: Guardrails, f: MoneyFacts, amountSol: number, setupSol: number | null) {
  if (f.walletSol === null || f.positionRentSol === null || setupSol === null) return null;
  const free = freeSol(f.walletSol, f.book.open, slotOverheadSol(g, f.positionRentSol));
  return free - amountSol - setupSol - g.txFeeBufferSol;
}

/** Why a money rule could not be evaluated. */
function unknownMoney(f: Pick<MoneyFacts, "walletSol" | "positionRentSol">, setupSol: number | null) {
  if (f.walletSol === null) return "wallet unread";
  if (f.positionRentSol === null) return "rent unread";
  return setupSol === null ? "setup cost not quoted" : null;
}

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

/** The day-start capital as stored on the office row; null when it was taken on another UTC day or never. */
export function storedDayCapital(row: { dayCapitalSol: number | null; dayCapitalAt: Date | null }, now: number) {
  if (row.dayCapitalSol === null || row.dayCapitalAt === null) return null;
  return utcDayStart(row.dayCapitalAt).getTime() === utcDayStart(now).getTime() ? row.dayCapitalSol : null;
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

const rebalanceCheck = (managed: boolean): GuardrailCheck => ({
  rule: "not_rebalance_managed",
  ok: !managed,
  value: managed ? "an auto-rebalance agent manages this pool" : "free",
});

function cooldownCheck(g: Guardrails, f: Pick<MoneyFacts, "lastExecutionAt" | "now">): GuardrailCheck {
  const sinceMs = f.lastExecutionAt === null ? null : f.now - f.lastExecutionAt.getTime();
  return {
    rule: "cooldown",
    ok: sinceMs === null || sinceMs >= g.cooldownSec * 1000,
    value: sinceMs === null ? "no execution yet" : `${Math.floor(sinceMs / 1000)}s since last, needs ${g.cooldownSec}s`,
  };
}

/**
 * The money and timing rules for an open of `amountSol`. The Executor runs these again right before it signs; the
 * pool screen and the LLM budget were checked at review and would cost a screener request to read again.
 */
export function openMoneyChecks(
  g: Guardrails,
  proposal: { readonly amountSol: number; readonly setupSol: number | null },
  f: MoneyFacts,
): GuardrailCheck[] {
  const { amountSol, setupSol } = proposal;
  const book = f.book.open;
  const cap = positionBudget(g, f, setupSol);
  const left = leftAfterOpen(g, f, amountSol, setupSol);
  const unknown = unknownMoney(f, setupSol);
  const loss = dailyLossPct(f.dayStartCapital, dayPnlSol(f.book, f.now));
  return [
    {
      rule: "position_size",
      ok: cap !== null && amountSol <= cap,
      value:
        cap === null
          ? (unknown ?? "unknown")
          : `${sol(amountSol)} of max ${sol(cap)} (${g.maxPositionPct}% of capital, room for ${g.maxActivePositions} positions)`,
    },
    {
      rule: "sol_reserve",
      ok: left !== null && left >= g.solReserve,
      value:
        left === null
          ? (unknown ?? "unknown")
          : `${sol(left)} left after ${sol(setupSol ?? 0)} rent and ${sol(g.txFeeBufferSol)} fee buffer, reserve ${sol(g.solReserve)}`,
    },
    {
      rule: "max_active_positions",
      ok: book.length < g.maxActivePositions,
      value: `${book.length} open of ${g.maxActivePositions}`,
    },
    {
      rule: "daily_loss",
      ok: loss !== null && loss < g.maxDailyLossPct,
      value: loss === null ? "PnL or capital unknown" : `${pct(loss)} of max ${pct(g.maxDailyLossPct)}`,
    },
    rebalanceCheck(f.rebalanceManaged),
    cooldownCheck(g, f),
  ];
}

/**
 * Every hard rule for an `open` proposal. A rule that cannot be evaluated (wallet unread, pool unknown) fails: the
 * code never guesses in the proposal's favor. The proposal passes only when every check is ok.
 */
export function checkOpen(g: Guardrails, filter: PoolFilter | null, f: RiskFacts): GuardrailCheck[] {
  return [
    ...openMoneyChecks(g, f.params, f),
    {
      rule: "pool_alertable",
      ok: f.pool !== null && filter !== null && alertable(f.pool, filter),
      value: poolVerdict(f.pool, filter),
    },
    {
      rule: "llm_budget",
      ok: budgetLeft(f.llmSpentUsd, f.llmCapUsd),
      value: `$${f.llmSpentUsd.toFixed(4)} of $${f.llmCapUsd.toFixed(2)} today`,
    },
  ];
}

/** What the rules for a rebalance, claim or close read. */
export type ManageFacts = Pick<
  MoneyFacts,
  "walletSol" | "positionRentSol" | "book" | "rebalanceManaged" | "lastExecutionAt" | "now"
> & {
  readonly kind: Exclude<ProposalKind, "open">;
  /** One of the office's open journal rows holds the proposal's position. */
  readonly officePosition: boolean;
  /**
   * Rent a rebalance's new range still needs (bin arrays and bitmap, `quoteRangeArrays`), read on chain; 0 for a claim.
   * Null when it could not be quoted, which fails the reserve rule.
   */
  readonly setupSol: number | null;
};

/**
 * Every hard rule for acting on a position the office already holds. Only the office's own positions are touched,
 * never one an auto-rebalance agent manages. A close is the way out, so the reserve and the cooldown never hold it.
 */
export function checkManage(g: Guardrails, f: ManageFacts): GuardrailCheck[] {
  const checks: GuardrailCheck[] = [
    {
      rule: "office_position",
      ok: f.officePosition,
      value: f.officePosition ? "opened by the office" : "not an open office position",
    },
    rebalanceCheck(f.rebalanceManaged),
  ];
  if (f.kind === "close") return checks;
  const free =
    f.walletSol === null || f.positionRentSol === null
      ? null
      : freeSol(f.walletSol, f.book.open, slotOverheadSol(g, f.positionRentSol));
  // A rebalance pays the rent of any bin array its new range creates, and its transactions' fees.
  const cost = f.setupSol === null ? null : f.kind === "rebalance" ? f.setupSol + g.txFeeBufferSol : 0;
  const left = free === null || cost === null ? null : free - cost;
  return [
    ...checks,
    {
      rule: "sol_reserve",
      ok: left !== null && left >= g.solReserve,
      value:
        left === null
          ? (unknownMoney(f, f.setupSol) ?? "unknown")
          : cost
            ? `${sol(left)} left after ${sol(f.setupSol ?? 0)} new bin arrays and ${sol(g.txFeeBufferSol)} fee buffer, reserve ${sol(g.solReserve)}`
            : `${sol(left)} free, reserve ${sol(g.solReserve)}`,
    },
    cooldownCheck(g, f),
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
