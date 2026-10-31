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
  inRange: boolean | null;
  sol: ActiveAmounts;
  usd: ActiveAmounts;
}

export interface Portfolio {
  wallet: string;
  fetchedAt: number;
  solPrice: number | null;
  closed: ClosedPosition[];
  active: ActivePosition[];
  /** Meteora's own all-time total, which can include positions outside the loaded window. */
  allTime: { closedPositions: number; sol: number; usd: number };
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
