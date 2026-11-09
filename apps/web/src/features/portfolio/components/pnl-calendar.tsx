import { ChevronLeftIcon, ChevronRightIcon, ShareIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useTzOffset } from "@/features/timezone/timezone";
import { money, pct, tone } from "../money";
import {
  type Bucket,
  type CalendarWeek,
  type ClosedPosition,
  type Currency,
  dailyBuckets,
  dayStart,
  type Metric,
  type MonthCalendar,
  monthCalendar,
  shifted,
} from "../portfolio";
import { METRIC_OPTIONS, Segmented } from "./segmented";
import { ShareDialog } from "./share-dialog";
import { Panel } from "./summary-panels";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthName = (year: number, month: number) =>
  new Date(Date.UTC(year, month)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayName = (date: number) =>
  new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

// Phone cells are ~40px wide, so they drop the SOL unit and round to six characters; the month total stays exact.
function cellMoney(value: number, currency: Currency) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : value > 0 ? "+" : "";
  if (currency === "sol") return `${sign}${abs.toFixed(abs >= 100 ? 0 : abs >= 10 ? 1 : 2)}`;
  return `${sign}$${abs >= 1e3 ? `${(abs / 1e3).toFixed(1)}K` : abs.toFixed(abs >= 10 ? 0 : 2)}`;
}

type Share =
  | { kind: "month" }
  | { kind: "day"; bucket: Bucket }
  | { kind: "week"; week: CalendarWeek; n: number }
  | null;

export function PnlCalendar({ closed, currency, now }: { closed: ClosedPosition[]; currency: Currency; now: number }) {
  const [metric, setMetric] = useState<Metric>("pnl");
  const offset = useTzOffset();
  const nowShifted = shifted(now, offset);
  const nowDate = new Date(nowShifted);
  const [view, setView] = useState({ year: nowDate.getUTCFullYear(), month: nowDate.getUTCMonth() });
  // Content outlives `open` so the dialog keeps its card while the close animation plays.
  const [share, setShare] = useState<Share>(null);
  const [sharing, setSharing] = useState(false);
  const openShare = (next: Share) => {
    setShare(next);
    setSharing(true);
  };

  const days = useMemo(() => dailyBuckets(closed, currency, metric, offset), [closed, currency, metric, offset]);
  const cal = monthCalendar(days, view.year, view.month);
  const shift = (by: number) => {
    const d = new Date(Date.UTC(view.year, view.month + by));
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };
  const isThisMonth = view.year === nowDate.getUTCFullYear() && view.month === nowDate.getUTCMonth();

  return (
    <Panel className="flex flex-col">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2.5 text-sm font-medium">
          Realized PnL
          <ShareButton label="Share month" onClick={() => openShare({ kind: "month" })} size="md" />
        </h2>
        <Segmented value={metric} options={METRIC_OPTIONS} onChange={setMetric} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shift(-1)}
            className="p-0.75 hover:text-brand"
          >
            <ChevronLeftIcon className="size-3.25" />
          </button>
          <span className="min-w-28.75 text-center text-sm font-medium">{monthName(view.year, view.month)}</span>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="p-0.75 hover:text-brand">
            <ChevronRightIcon className="size-3.25" />
          </button>
          <button
            type="button"
            disabled={isThisMonth}
            onClick={() => setView({ year: nowDate.getUTCFullYear(), month: nowDate.getUTCMonth() })}
            className="ml-2.5 rounded-md bg-muted px-2.5 py-0.75 text-xs font-medium disabled:opacity-100 enabled:hover:bg-muted/70"
          >
            This month
          </button>
        </div>
        <MonthStats cal={cal} currency={currency} />
      </div>

      <div className="mt-3.25 overflow-x-auto">
        <CalendarGrid
          cal={cal}
          currency={currency}
          today={dayStart(nowShifted)}
          onShareDay={(bucket) => openShare({ kind: "day", bucket })}
          onShareWeek={(week, n) => openShare({ kind: "week", week, n })}
        />
      </div>

      <ShareDialog
        open={sharing}
        onOpenChange={setSharing}
        hint="Click any calendar metric to hide or restore it"
        title={share?.kind === "day" ? dayName(share.bucket.start) : monthName(view.year, view.month)}
      >
        {share?.kind === "month" && (
          <>
            <div className="mt-3.25 mb-3.25 flex items-end justify-between">
              <h3 className="text-3xl font-bold uppercase">{monthName(view.year, view.month)}</h3>
              <MonthStats cal={cal} currency={currency} />
            </div>
            <CalendarGrid cal={cal} currency={currency} today={dayStart(nowShifted)} compact />
          </>
        )}
        {share?.kind === "day" && (
          <PeriodCard title={dayName(share.bucket.start)} bucket={share.bucket} currency={currency} />
        )}
        {share?.kind === "week" && (
          <PeriodCard
            title={`${monthName(view.year, view.month)} · Week ${share.n}`}
            bucket={{
              start: share.week.cells[0]?.date ?? 0,
              value: share.week.total,
              positions: share.week.cells.reduce((n, c) => n + (c.bucket?.positions ?? 0), 0),
              wins: share.week.cells.reduce((n, c) => n + (c.bucket?.wins ?? 0), 0),
            }}
            days={share.week.activeDays}
            currency={currency}
          />
        )}
      </ShareDialog>
    </Panel>
  );
}

function MonthStats({ cal, currency }: { cal: MonthCalendar; currency: Currency }) {
  return (
    <div data-share-item className="flex items-center gap-2.5 text-xs whitespace-nowrap">
      <span className="text-muted-foreground">Monthly stats:</span>
      <span className={`font-medium tabular-nums ${tone(cal.total)}`}>{money(cal.total, currency, { digits: 2 })}</span>
      <span className="text-muted-foreground">
        {cal.activeDays} day{cal.activeDays === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function ShareButton({ label, onClick, size = "sm" }: { label: string; onClick: () => void; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-foreground/60 transition-colors hover:text-foreground"
    >
      <ShareIcon className={size === "md" ? "size-[0.9rem]" : "size-2.75"} />
    </button>
  );
}

function CalendarGrid({
  cal,
  currency,
  today,
  compact = false,
  onShareDay,
  onShareWeek,
}: {
  cal: MonthCalendar;
  currency: Currency;
  today: number;
  compact?: boolean;
  onShareDay?: (bucket: Bucket) => void;
  onShareWeek?: (week: CalendarWeek, n: number) => void;
}) {
  const cellH = compact ? "h-[3.6rem]" : "h-12 sm:h-[4.35rem]";
  const big = compact ? "text-[0.625rem]" : "text-[0.85rem]";
  const small = compact ? "text-[0.5rem]" : "text-[0.55rem]";
  return (
    <div
      className={`grid ${
        compact
          ? "grid-cols-[repeat(7,1fr)_1.3fr]"
          : "grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.3fr)] sm:min-w-[36rem] sm:grid-cols-[repeat(7,1fr)_6.875rem]"
      }`}
    >
      {WEEKDAYS.map((d) => (
        <div
          key={d}
          className={`pb-1.5 text-center text-muted-foreground ${compact ? "text-[0.625rem]" : "text-[0.65rem]"}`}
        >
          {d}
        </div>
      ))}
      <div className={`pb-1.5 text-center text-muted-foreground ${compact ? "text-[0.625rem]" : "text-[0.65rem]"}`}>
        {compact ? "Week" : ""}
      </div>

      {cal.weeks.map((week, wi) => (
        <div key={week.cells[0]?.date} className="contents">
          {week.cells.map((cell) => {
            const b = compact && !cell.inMonth ? null : cell.bucket;
            const isToday = cell.date === today;
            const bg = !b ? "" : b.value > 0 ? "bg-profit/15" : b.value < 0 ? "bg-loss/20" : "bg-muted/40";
            return (
              <div
                key={cell.date}
                className={`relative flex ${cellH} flex-col items-center justify-center border-[0.025rem] border-border ${bg} ${
                  isToday ? "outline-2 -outline-offset-2 outline-foreground/70" : ""
                }`}
              >
                <span
                  className={`absolute top-1.25 right-1.5 text-muted-foreground ${compact ? "text-[0.625rem]" : "text-[0.625rem]"}`}
                >
                  {cell.day}
                </span>
                {b && onShareDay && (
                  <>
                    <span className="absolute top-1.5 left-3.25 max-sm:hidden">
                      <ShareButton label={`Share ${dayName(cell.date)}`} onClick={() => onShareDay(b)} />
                    </span>
                    {/* Phone cells have no room for the icon, so the whole cell shares. */}
                    <button
                      type="button"
                      aria-label={`Share ${dayName(cell.date)}`}
                      onClick={() => onShareDay(b)}
                      className="absolute inset-0 z-10 sm:hidden"
                    />
                  </>
                )}
                {b && (
                  <div className="text-center leading-tight" data-share-item>
                    {!compact && (
                      <div
                        className={`mt-2 text-[0.6rem] font-bold whitespace-nowrap tabular-nums sm:hidden ${tone(b.value)}`}
                      >
                        {cellMoney(b.value, currency)}
                      </div>
                    )}
                    <div className={compact ? "" : "max-sm:hidden"}>
                      <div className={`${big} font-bold whitespace-nowrap tabular-nums ${tone(b.value)}`}>
                        {money(b.value, currency, { signed: true, digits: 2 })}
                      </div>
                      <div className={`${small} text-muted-foreground`}>
                        {b.positions} position{b.positions === 1 ? "" : "s"}
                      </div>
                      <div className={`${small} tabular-nums text-muted-foreground`}>
                        {pct(b.wins / b.positions, 1)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div
            className={`flex ${cellH} flex-col items-center justify-center leading-tight ${compact ? "border-[0.025rem] border-border" : "ml-1 border-l sm:ml-1.5"}`}
            data-share-item
          >
            <span
              className={`flex items-center gap-1.25 ${compact ? "text-[0.625rem] font-semibold" : "text-[0.6rem] sm:text-[0.65rem]"}`}
            >
              {compact ? (
                `Week ${wi + 1}`
              ) : (
                <>
                  <span className="sm:hidden">W{wi + 1}</span>
                  <span className="max-sm:hidden">Week {wi + 1}</span>
                </>
              )}
              {onShareWeek && week.activeDays > 0 && (
                <ShareButton label={`Share week ${wi + 1}`} onClick={() => onShareWeek(week, wi + 1)} />
              )}
            </span>
            {!compact && (
              <span className={`mt-0.5 text-[0.6rem] font-semibold tabular-nums sm:hidden ${tone(week.total)}`}>
                {cellMoney(week.total, currency)}
              </span>
            )}
            <span
              className={`mt-0.75 font-semibold tabular-nums ${compact ? "text-[0.55rem]" : "text-xs max-sm:hidden"} ${tone(week.total)}`}
            >
              {money(week.total, currency, { digits: 2 })}
            </span>
            <span
              className={`mt-0.5 text-muted-foreground ${compact ? "text-[0.5625rem]" : "text-[0.55rem] max-sm:hidden"}`}
            >
              {week.activeDays} day{week.activeDays === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PeriodCard({
  title,
  bucket,
  days,
  currency,
}: {
  title: string;
  bucket: Bucket;
  days?: number;
  currency: Currency;
}) {
  return (
    <div className="py-6.5">
      <h3 data-share-item className="text-2xl font-extrabold uppercase">
        {title}
      </h3>
      <p data-share-item className={`mt-4.75 text-4xl font-bold tabular-nums ${tone(bucket.value)}`}>
        {money(bucket.value, currency, { signed: true })}
      </p>
      <div className="mt-4.75 flex gap-6.5 text-xs">
        <span data-share-item>
          <span className="block text-muted-foreground">Positions</span>
          <span className="text-sm font-semibold tabular-nums">{bucket.positions}</span>
        </span>
        <span data-share-item>
          <span className="block text-muted-foreground">Win rate</span>
          <span className="text-sm font-semibold tabular-nums">
            {bucket.positions ? pct(bucket.wins / bucket.positions, 1) : "—"}
          </span>
        </span>
        {days !== undefined && (
          <span data-share-item>
            <span className="block text-muted-foreground">Active days</span>
            <span className="text-sm font-semibold tabular-nums">{days}</span>
          </span>
        )}
      </div>
    </div>
  );
}
