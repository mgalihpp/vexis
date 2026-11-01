// Client-safe portfolio model and the pure math behind every panel.
// All day boundaries are UTC so the server render and the browser agree.

export type Currency = "sol" | "usd";
export type Metric = "pnl" | "fees";

export interface Amounts {
  deposit: number;
  withdraw: number;
  fees: number;
  pnl: number;
}

export interface ClosedPosition {
  address: string;
  pool: string;
  pair: string;
  openedAt: number;
  closedAt: number;
  sol: Amounts;
  usd: Amounts;
}

export interface ActiveAmounts extends Amounts {
  balance: number;
  unclaimed: number;
}

export interface ActivePosition {
  address: string;
  pool: string;
  pair: string;
  openedAt: number | null;
  lowerBin: number;
  upperBin: number;
  /** Prices (token Y per token X) at the lower and upper bin. */
  minPrice: number;
  maxPrice: number;
  inRange: boolean | null;
  sol: ActiveAmounts;
  usd: ActiveAmounts;
}

export interface Token {
  symbol: string;
  mint: string;
  icon: string | null;
  verified: boolean;
  /** USD price, used with `ActivePool.fdv` to price historical events. */
  priceUsd: number | null;
  /** Jupiter's 0-100 organic trading score; null when Jupiter has no data. */
  organicScore: number | null;
  /** Jupiter audit warnings, e.g. "Mint authority enabled"; null when Jupiter has no data. */
  risks: string[] | null;
}

/** The subset of Jupiter's token `audit` block (plus `mintAuthority`) that decides the warnings. */
export interface TokenAudit {
  isSus?: boolean | null;
  mintAuthority?: string | null;
  mintAuthorityDisabled?: boolean | null;
  freezeAuthorityDisabled?: boolean | null;
  topHoldersPercentage?: number | null;
  devMints?: number | null;
}

// Jupiter's docs call top-holder concentration under 20% low risk.
const TOP_HOLDERS_RISK_PCT = 20;

export function tokenRisks(a: TokenAudit): string[] {
  const out: string[] = [];
  if (a.isSus) out.push("Flagged as suspicious");
  // Jupiter omits mintAuthorityDisabled for some tokens; a live mint authority on the token itself still counts.
  if (a.mintAuthorityDisabled === false || (a.mintAuthorityDisabled == null && a.mintAuthority))
    out.push("Mint authority enabled");
  if (a.freezeAuthorityDisabled === false) out.push("Freeze authority enabled");
  if ((a.topHoldersPercentage ?? 0) > TOP_HOLDERS_RISK_PCT)
    out.push(`Top holders own ${Math.round(a.topHoldersPercentage ?? 0)}%`);
  if ((a.devMints ?? 0) > 0) out.push(`Developer has launched ${a.devMints} tokens`);
  return out;
}

/** What identifies a pool on screen: the pair, its tokens and its fee tier. */
export interface PoolMeta {
  address: string;
  pair: string;
  tokenX: Token;
  tokenY: Token;
  binStep: number;
  /** Percent, e.g. 0.25 for 0.25%. */
  baseFee: number;
  dynamicFee: number | null;
}

export interface ActivePool extends PoolMeta {
  /** Current price, token Y per token X. */
  price: number;
  activeBin: number | null;
  /** Token X fully diluted value in USD. */
  fdv: number | null;
  tvl: number | null;
  positions: ActivePosition[];
}

export interface Portfolio {
  wallet: string;
  fetchedAt: number;
  solPrice: number | null;
  closed: ClosedPosition[];
  /** Metadata for every pool in `closed`. */
  closedPools: PoolMeta[];
  active: ActivePool[];
  /** Meteora's own all-time total, which can include positions outside the loaded window. */
  allTime: { closedPositions: number; sol: number; usd: number };
  /** Closed pools whose positions are loaded. */
  closedProgress: LoadProgress;
}

/** `loaded` of `total` items are in; `running` while a background fetch is in flight. */
export interface LoadProgress {
  loaded: number;
  total: number;
  running: boolean;
}

export const DAY_MS = 86_400_000;

export const dayStart = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

const utc = (y: number, m: number, d = 1) => Date.UTC(y, m, d);

// ---------- Date ranges ----------

export const RANGE_PRESETS = [
  { id: "all", label: "All" },
  { id: "custom", label: "Custom" },
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this-week", label: "This week (Sun - Today)" },
  { id: "last-7", label: "Last 7 days" },
  { id: "last-week", label: "Last week (Sun - Sat)" },
  { id: "last-28", label: "Last 28 days" },
  { id: "last-30", label: "Last 30 days" },
  { id: "this-month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "last-90", label: "Last 90 days" },
  { id: "qtd", label: "Quarter to date" },
  { id: "ytd", label: "This year (Jan - Today)" },
  { id: "last-year", label: "Last year" },
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number]["id"];

/** Inclusive start, exclusive end, both UTC midnights. `null` means unbounded. */
export interface DateRange {
  from: number | null;
  to: number | null;
}

export function resolveRange(
  preset: RangePreset,
  now: number,
  custom: DateRange = { from: null, to: null },
): DateRange {
  const today = dayStart(now);
  const tomorrow = today + DAY_MS;
  const d = new Date(today);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const sunday = today - d.getUTCDay() * DAY_MS;
  const lastDays = (n: number) => ({ from: tomorrow - n * DAY_MS, to: tomorrow });
  switch (preset) {
    case "all":
      return { from: null, to: null };
    case "custom":
      return custom;
    case "today":
      return { from: today, to: tomorrow };
    case "yesterday":
      return { from: today - DAY_MS, to: today };
    case "this-week":
      return { from: sunday, to: tomorrow };
    case "last-7":
      return lastDays(7);
    case "last-week":
      return { from: sunday - 7 * DAY_MS, to: sunday };
    case "last-28":
      return lastDays(28);
    case "last-30":
      return lastDays(30);
    case "this-month":
      return { from: utc(y, m), to: tomorrow };
    case "last-month":
      return { from: utc(y, m - 1), to: utc(y, m) };
    case "last-90":
      return lastDays(90);
    case "qtd":
      return { from: utc(y, m - (m % 3)), to: tomorrow };
    case "ytd":
      return { from: utc(y, 0), to: tomorrow };
    case "last-year":
      return { from: utc(y - 1, 0), to: utc(y, 0) };
  }
}

export const inRange = (closed: ClosedPosition[], { from, to }: DateRange) =>
  closed.filter((p) => (from === null || p.closedAt >= from) && (to === null || p.closedAt < to));

// ---------- Headline stats ----------

export interface Stats {
  count: number;
  net: number;
  wins: number;
  losses: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  avgWin: number;
  avgLoss: number;
  winLossRatio: number | null;
  dayWins: number;
  dayLosses: number;
  deposits: number;
  withdrawals: number;
  fees: number;
  avgInvested: number;
}

const ratio = (a: number, b: number) => (b === 0 ? null : a / b);

export function summarize(closed: ClosedPosition[], currency: Currency): Stats {
  let wins = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let deposits = 0;
  let withdrawals = 0;
  let fees = 0;
  for (const p of closed) {
    const a = p[currency];
    if (a.pnl > 0) {
      wins++;
      grossProfit += a.pnl;
    } else {
      grossLoss -= a.pnl;
    }
    deposits += a.deposit;
    withdrawals += a.withdraw;
    fees += a.fees;
  }
  const losses = closed.length - wins;
  const avgWin = wins ? grossProfit / wins : 0;
  const avgLoss = losses ? grossLoss / losses : 0;
  const days = dailyBuckets(closed, currency, "pnl");
  const dayWins = days.filter((b) => b.value > 0).length;
  return {
    count: closed.length,
    net: grossProfit - grossLoss,
    wins,
    losses,
    grossProfit,
    grossLoss,
    profitFactor: ratio(grossProfit, grossLoss),
    avgWin,
    avgLoss,
    winLossRatio: ratio(avgWin, avgLoss),
    dayWins,
    dayLosses: days.length - dayWins,
    deposits,
    withdrawals,
    fees,
    avgInvested: closed.length ? deposits / closed.length : 0,
  };
}

// ---------- Day buckets ----------

export interface Bucket {
  /** UTC midnight of the bucket's first day. */
  start: number;
  value: number;
  positions: number;
  wins: number;
}

const amountOf = (p: ClosedPosition, currency: Currency, metric: Metric) => p[currency][metric];

/** One bucket per UTC day that closed at least one position, oldest first. */
export function dailyBuckets(closed: ClosedPosition[], currency: Currency, metric: Metric): Bucket[] {
  const byDay = new Map<number, Bucket>();
  for (const p of closed) {
    const start = dayStart(p.closedAt);
    const b = byDay.get(start) ?? { start, value: 0, positions: 0, wins: 0 };
    b.value += amountOf(p, currency, metric);
    b.positions++;
    if (p[currency].pnl > 0) b.wins++;
    byDay.set(start, b);
  }
  return [...byDay.values()].sort((a, b) => a.start - b.start);
}

export type Granularity = "daily" | "weekly" | "monthly";

const periodStart = (ms: number, g: Granularity) => {
  if (g === "daily") return dayStart(ms);
  const d = new Date(dayStart(ms));
  if (g === "weekly") return d.getTime() - d.getUTCDay() * DAY_MS;
  return utc(d.getUTCFullYear(), d.getUTCMonth());
};

const nextPeriod = (start: number, g: Granularity) => {
  if (g === "daily") return start + DAY_MS;
  if (g === "weekly") return start + 7 * DAY_MS;
  const d = new Date(start);
  return utc(d.getUTCFullYear(), d.getUTCMonth() + 1);
};

/** Contiguous series from the first to the last bucket, gaps filled with zero. */
export function series(days: Bucket[], g: Granularity): Bucket[] {
  const first = days[0];
  const last = days.at(-1);
  if (!first || !last) return [];
  const byPeriod = new Map<number, Bucket>();
  for (const b of days) {
    const start = periodStart(b.start, g);
    const acc = byPeriod.get(start) ?? { start, value: 0, positions: 0, wins: 0 };
    acc.value += b.value;
    acc.positions += b.positions;
    acc.wins += b.wins;
    byPeriod.set(start, acc);
  }
  const out: Bucket[] = [];
  for (let t = periodStart(first.start, g); t <= last.start; t = nextPeriod(t, g)) {
    out.push(byPeriod.get(t) ?? { start: t, value: 0, positions: 0, wins: 0 });
  }
  return out;
}

export function cumulative(days: Bucket[]): { start: number; value: number }[] {
  let total = 0;
  return series(days, "daily").map((b) => {
    total += b.value;
    return { start: b.start, value: total };
  });
}

// ---------- Month calendar ----------

export interface CalendarCell {
  date: number;
  day: number;
  inMonth: boolean;
  bucket: Bucket | null;
}

export interface CalendarWeek {
  cells: CalendarCell[];
  total: number;
  activeDays: number;
}

export interface MonthCalendar {
  year: number;
  month: number;
  weeks: CalendarWeek[];
  total: number;
  activeDays: number;
}

/** Sunday-first weeks covering the month. Week totals include the spill-over days; month totals do not. */
export function monthCalendar(days: Bucket[], year: number, month: number): MonthCalendar {
  const byDay = new Map(days.map((b) => [b.start, b]));
  const first = utc(year, month);
  const next = utc(year, month + 1);
  const weeks: CalendarWeek[] = [];
  let total = 0;
  let activeDays = 0;
  for (let start = first - new Date(first).getUTCDay() * DAY_MS; start < next; start += 7 * DAY_MS) {
    const cells: CalendarCell[] = [];
    let weekTotal = 0;
    let weekDays = 0;
    for (let i = 0; i < 7; i++) {
      const date = start + i * DAY_MS;
      const bucket = byDay.get(date) ?? null;
      const inMonth = date >= first && date < next;
      cells.push({ date, day: new Date(date).getUTCDate(), inMonth, bucket });
      if (!bucket) continue;
      weekTotal += bucket.value;
      weekDays++;
      if (inMonth) {
        total += bucket.value;
        activeDays++;
      }
    }
    weeks.push({ cells, total: weekTotal, activeDays: weekDays });
  }
  return { year, month, weeks, total, activeDays };
}

// ---------- Active positions ----------

export const SOL_MINT = "So11111111111111111111111111111111111111112";

/** One on-chain action on a position. `type` is "add", "remove", "claim_fee", or anything newer. */
export interface PositionEvent {
  /** Signature, instruction index and type: one instruction can both claim fees and remove liquidity. */
  id: string;
  signature: string;
  type: string;
  at: number;
  amountX: number;
  amountY: number;
  amountXUsd: number;
  amountYUsd: number;
  totalUsd: number;
}

export function poolTotals(positions: ActivePosition[], currency: Currency): ActiveAmounts {
  const t = { deposit: 0, withdraw: 0, fees: 0, pnl: 0, balance: 0, unclaimed: 0 };
  for (const p of positions) {
    const a = p[currency];
    t.deposit += a.deposit;
    t.withdraw += a.withdraw;
    t.fees += a.fees;
    t.pnl += a.pnl;
    t.balance += a.balance;
    t.unclaimed += a.unclaimed;
  }
  return t;
}

export interface ClosedPoolRow {
  pool: PoolMeta;
  /** Newest close first; `n` numbers them by open time, oldest = 1. */
  positions: { position: ClosedPosition; n: number }[];
  lastClosedAt: number;
  /** Time held, summed over the positions. */
  heldMs: number;
  sol: Amounts;
  usd: Amounts;
}

const unknownToken = (symbol: string): Token => ({
  symbol,
  mint: "",
  icon: null,
  verified: false,
  priceUsd: null,
  organicScore: null,
  risks: null,
});

const addAmounts = (t: Amounts, a: Amounts) => {
  t.deposit += a.deposit;
  t.withdraw += a.withdraw;
  t.fees += a.fees;
  t.pnl += a.pnl;
};

/** Closed positions grouped by pool, in first-seen order. */
export function closedPoolRows(closed: ClosedPosition[], pools: PoolMeta[]): ClosedPoolRow[] {
  const meta = new Map(pools.map((p) => [p.address, p]));
  const groups = new Map<string, ClosedPosition[]>();
  for (const p of closed) groups.set(p.pool, [...(groups.get(p.pool) ?? []), p]);
  return [...groups].map(([address, positions]) => {
    const [x = "", y = ""] = positions[0]?.pair.split("-") ?? [];
    const pool = meta.get(address) ?? {
      address,
      pair: positions[0]?.pair ?? "",
      tokenX: unknownToken(x),
      tokenY: unknownToken(y),
      binStep: 0,
      baseFee: 0,
      dynamicFee: null,
    };
    const byOpen = [...positions].sort((a, b) => a.openedAt - b.openedAt);
    const sol = { deposit: 0, withdraw: 0, fees: 0, pnl: 0 };
    const usd = { ...sol };
    for (const p of positions) {
      addAmounts(sol, p.sol);
      addAmounts(usd, p.usd);
    }
    return {
      pool,
      positions: byOpen
        .map((position, i) => ({ position, n: i + 1 }))
        .sort((a, b) => b.position.closedAt - a.position.closedAt),
      lastClosedAt: Math.max(...positions.map((p) => p.closedAt)),
      heldMs: positions.reduce((t, p) => t + (p.closedAt - p.openedAt), 0),
      sol,
      usd,
    };
  });
}

export type BinRange = Pick<ActivePosition, "lowerBin" | "upperBin" | "minPrice" | "maxPrice">;

/** The bins covered by every position together, or null when there are none. */
export function binSpan(positions: ActivePosition[]): BinRange | null {
  let out: BinRange | null = null;
  for (const p of positions) {
    if (!out) {
      out = { lowerBin: p.lowerBin, upperBin: p.upperBin, minPrice: p.minPrice, maxPrice: p.maxPrice };
      continue;
    }
    if (p.lowerBin < out.lowerBin) Object.assign(out, { lowerBin: p.lowerBin, minPrice: p.minPrice });
    if (p.upperBin > out.upperBin) Object.assign(out, { upperBin: p.upperBin, maxPrice: p.maxPrice });
  }
  return out;
}

export const openedAt = (positions: ActivePosition[]) => {
  const times = positions.flatMap((p) => (p.openedAt === null ? [] : [p.openedAt]));
  return times.length ? Math.min(...times) : null;
};

/** How far the range edges sit from the current price, as ratios (-0.005 is 0.5% below). */
export const rangeOffsets = (range: Pick<BinRange, "minPrice" | "maxPrice">, price: number) => ({
  lower: range.minPrice / price - 1,
  upper: range.maxPrice / price - 1,
});

/** Below the active bin a DLMM bin holds token Y, above it token X. */
export type BinSide = "y" | "active" | "x";

export interface Bin {
  bin: number;
  price: number;
  side: BinSide;
}

export function binLadder(range: BinRange, pool: Pick<ActivePool, "binStep" | "activeBin" | "price">): Bin[] {
  const step = 1 + pool.binStep / 10_000;
  const active = pool.activeBin ?? range.lowerBin + Math.round(Math.log(pool.price / range.minPrice) / Math.log(step));
  const out: Bin[] = [];
  for (let bin = range.lowerBin; bin <= range.upperBin; bin++) {
    const side = bin < active ? "y" : bin > active ? "x" : "active";
    out.push({ bin, price: range.minPrice * step ** (bin - range.lowerBin), side });
  }
  return out;
}

/** Token X's FDV if its price moved to `price`. */
export const fdvAt = (pool: Pick<ActivePool, "fdv" | "price">, price: number) =>
  pool.fdv === null || !pool.price ? null : (pool.fdv * price) / pool.price;

export interface ActivityValue {
  amount: number;
  usd: number;
  /** Null when no SOL price is known at all. */
  sol: number | null;
}

export interface ActivityRow {
  id: string;
  signature: string;
  type: string;
  at: number;
  x: ActivityValue;
  y: ActivityValue;
  total: Omit<ActivityValue, "amount">;
  /** Token X's FDV when the event happened. */
  fdv: number | null;
}

/**
 * Events carry USD values only. A SOL side's own USD/amount is the SOL price at that moment, and
 * token X's USD/amount scaled by its supply (fdv / price) is the FDV then; both carry forward to
 * events that do not reveal them. Events oldest first.
 */
export function activityRows(
  events: PositionEvent[],
  pool: Pick<ActivePool, "tokenX" | "tokenY" | "fdv">,
  solPrice: number | null,
): ActivityRow[] {
  const supply = pool.fdv !== null && pool.tokenX.priceUsd ? pool.fdv / pool.tokenX.priceUsd : null;
  let solUsd: number | null = null;
  let fdv: number | null = null;
  return events.map((e) => {
    if (pool.tokenY.mint === SOL_MINT && e.amountY > 0 && e.amountYUsd > 0) solUsd = e.amountYUsd / e.amountY;
    else if (pool.tokenX.mint === SOL_MINT && e.amountX > 0 && e.amountXUsd > 0) solUsd = e.amountXUsd / e.amountX;
    if (supply !== null && e.amountX > 0 && e.amountXUsd > 0) fdv = (e.amountXUsd / e.amountX) * supply;
    const rate = solUsd ?? solPrice;
    const sol = (usd: number) => (rate ? usd / rate : null);
    return {
      id: e.id,
      signature: e.signature,
      type: e.type,
      at: e.at,
      x: { amount: e.amountX, usd: e.amountXUsd, sol: sol(e.amountXUsd) },
      y: { amount: e.amountY, usd: e.amountYUsd, sol: sol(e.amountYUsd) },
      total: { usd: e.totalUsd, sol: sol(e.totalUsd) },
      fdv,
    };
  });
}

// ---------- Transactions ----------

/** One position's events, oldest first, as `loadActivity` returns them. */
export interface PositionHistory {
  position: string;
  pool: string;
  openedAt: number | null;
  /** Null while the position is open. */
  closedAt: number | null;
  events: PositionEvent[];
}

/** The histories fetched so far; `total` counts the positions known so far, which grows while closed pools load. */
export interface Transactions {
  histories: PositionHistory[];
  progress: LoadProgress;
}

/** What a transaction row needs from its pool; a closed pool has no FDV. */
export type TransactionPool = PoolMeta & { fdv: number | null };

/** Opening and closing a position carry no event signature, so those rows have none. */
export type TransactionRow = Omit<ActivityRow, "signature"> & {
  signature: string | null;
  position: string;
  pool: TransactionPool;
};

/** Pools by address for `transactionRows`; an active pool wins because it knows its FDV. */
export const transactionPools = (portfolio: Pick<Portfolio, "closedPools" | "active">) =>
  new Map<string, TransactionPool>([
    ...portfolio.closedPools.map((p): [string, TransactionPool] => [p.address, { ...p, fdv: null }]),
    ...portfolio.active.map((p): [string, TransactionPool] => [p.address, p]),
  ]);

/**
 * Every position's activity in one list, newest first. Meteora's history has no open or close
 * event, so those come from the position's own timestamps. A history whose pool is unknown is skipped.
 */
export function transactionRows(
  histories: PositionHistory[],
  pools: ReadonlyMap<string, TransactionPool>,
  solPrice: number | null,
): TransactionRow[] {
  return histories
    .flatMap((h) => {
      const pool = pools.get(h.pool);
      if (!pool) return [];
      const lifecycle = (type: string, at: number): TransactionRow => ({
        id: `${h.position}:${type}`,
        signature: null,
        type,
        at,
        x: { amount: 0, usd: 0, sol: 0 },
        y: { amount: 0, usd: 0, sol: 0 },
        total: { usd: 0, sol: 0 },
        fdv: null,
        position: h.position,
        pool,
      });
      // One signature can touch two positions, so the position address keeps ids unique.
      const events = activityRows(h.events, pool, solPrice).map(
        (row): TransactionRow => ({ ...row, id: `${h.position}:${row.id}`, position: h.position, pool }),
      );
      const rows = [
        ...(h.openedAt === null ? [] : [lifecycle("initialize", h.openedAt)]),
        ...events,
        ...(h.closedAt === null ? [] : [lifecycle("close", h.closedAt)]),
      ];
      // Reversed so the stable sort below keeps same-instant rows in lifecycle order, latest on top.
      return rows.reverse();
    })
    .sort((a, b) => b.at - a.at);
}
