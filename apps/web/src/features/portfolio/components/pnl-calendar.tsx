import { ChevronLeftIcon, ChevronRightIcon, ShareIcon } from "lucide-react";
import { useMemo, useState } from "react";
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
} from "../portfolio";
import { METRIC_OPTIONS, Segmented } from "./segmented";
import { ShareDialog } from "./share-dialog";
import { Panel } from "./summary-panels";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthName = (year: number, month: number) =>
  new Date(Date.UTC(year, month)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayName = (date: number) =>
  new Date(date).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

type Share =
  | { kind: "month" }
  | { kind: "day"; bucket: Bucket }
  | { kind: "week"; week: CalendarWeek; n: number }
  | null;

export function PnlCalendar({ closed, currency, now }: { closed: ClosedPosition[]; currency: Currency; now: number }) {
  const [metric, setMetric] = useState<Metric>("pnl");
  const nowDate = new Date(now);
  const [view, setView] = useState({ year: nowDate.getUTCFullYear(), month: nowDate.getUTCMonth() });
  // Content outlives `open` so the dialog keeps its card while the close animation plays.
  const [share, setShare] = useState<Share>(null);
  const [sharing, setSharing] = useState(false);
  const openShare = (next: Share) => {
    setShare(next);
    setSharing(true);
  };

  const days = useMemo(() => dailyBuckets(closed, currency, metric), [closed, currency, metric]);
  const cal = monthCalendar(days, view.year, view.month);
  const shift = (by: number) => {
    const d = new Date(Date.UTC(view.year, view.month + by));
    setView({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };
  const isThisMonth = view.year === nowDate.getUTCFullYear() && view.month === nowDate.getUTCMonth();

  return (
    <Panel className="flex flex-col">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-3 text-lg font-semibold">
          Realized PnL
          <ShareButton label="Share month" onClick={() => openShare({ kind: "month" })} size="md" />
        </h2>
        <Segmented value={metric} options={METRIC_OPTIONS} onChange={setMetric} />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="p-1 hover:text-brand">
            <ChevronLeftIcon className="size-4" />
          </button>
          <span className="min-w-36 text-center text-lg font-semibold">{monthName(view.year, view.month)}</span>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="p-1 hover:text-brand">
            <ChevronRightIcon className="size-4" />
          </button>
          <button
            type="button"
            disabled={isThisMonth}
            onClick={() => setView({ year: nowDate.getUTCFullYear(), month: nowDate.getUTCMonth() })}
            className="ml-3 rounded-md bg-muted px-3 py-1 text-[0.9375rem] font-medium disabled:opacity-100 enabled:hover:bg-muted/70"
          >
            This month
          </button>
        </div>
        <MonthStats cal={cal} currency={currency} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <CalendarGrid
          cal={cal}
          currency={currency}
          today={dayStart(now)}
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
            <div className="mt-4 mb-4 flex items-end justify-between">
              <h3 className="text-3xl font-extrabold uppercase">{monthName(view.year, view.month)}</h3>
              <MonthStats cal={cal} currency={currency} />
            </div>
            <CalendarGrid cal={cal} currency={currency} today={dayStart(now)} compact />
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
    <div data-share-item className="flex items-center gap-3 text-[0.9375rem] whitespace-nowrap">
      <span className="text-foreground/80">Monthly stats:</span>
      <span className={`font-medium tabular-nums ${tone(cal.total)}`}>{money(cal.total, currency, { digits: 2 })}</span>
      <span className="text-foreground/80">
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
      <ShareIcon className={size === "md" ? "size-[1.125rem]" : "size-3.5"} />
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
  const cellH = compact ? "h-[4rem]" : "h-[5.4375rem]";
  const big = compact ? "text-[0.6875rem]" : "text-[1.0625rem]";
  const small = compact ? "text-[0.5rem]" : "text-[0.6875rem]";
  return (
    <div
      className={`grid ${compact ? "grid-cols-[repeat(7,1fr)_1.3fr]" : "min-w-[45rem] grid-cols-[repeat(7,1fr)_6.875rem]"}`}
    >
      {WEEKDAYS.map((d) => (
        <div
          key={d}
          className={`pb-2 text-center text-foreground/70 ${compact ? "text-[0.625rem]" : "text-[0.8125rem]"}`}
        >
          {d}
        </div>
      ))}
      <div className={`pb-2 text-center text-foreground/70 ${compact ? "text-[0.625rem]" : "text-[0.8125rem]"}`}>
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
                className={`relative flex ${cellH} flex-col items-center justify-center border-[0.0313rem] border-border ${bg} ${
                  isToday ? "outline-2 -outline-offset-2 outline-foreground/70" : ""
                }`}
              >
                <span
                  className={`absolute top-1.5 right-2 text-foreground/70 ${compact ? "text-[0.5rem]" : "text-xs"}`}
                >
                  {cell.day}
                </span>
                {b && onShareDay && (
                  <span className="absolute top-2 left-4">
                    <ShareButton label={`Share ${dayName(cell.date)}`} onClick={() => onShareDay(b)} />
                  </span>
                )}
                {b && (
                  <div className="text-center leading-tight" data-share-item>
                    <div className={`${big} font-bold whitespace-nowrap tabular-nums ${tone(b.value)}`}>
                      {money(b.value, currency, { signed: true, digits: 2 })}
                    </div>
                    <div className={`${small} text-foreground/80`}>
                      {b.positions} position{b.positions === 1 ? "" : "s"}
                    </div>
                    <div className={`${small} tabular-nums text-foreground/80`}>{pct(b.wins / b.positions, 1)}</div>
                  </div>
                )}
              </div>
            );
          })}
          <div
            className={`flex ${cellH} flex-col items-center justify-center leading-tight ${compact ? "border-[0.0313rem] border-border" : "ml-2 border-l"}`}
            data-share-item
          >
            <span
              className={`flex items-center gap-1.5 ${compact ? "text-[0.625rem] font-semibold" : "text-[0.8125rem]"}`}
            >
              Week {wi + 1}
              {onShareWeek && week.activeDays > 0 && (
                <ShareButton label={`Share week ${wi + 1}`} onClick={() => onShareWeek(week, wi + 1)} />
              )}
            </span>
            <span
              className={`mt-1 font-semibold tabular-nums ${compact ? "text-[0.6875rem]" : "text-[0.9375rem]"} ${tone(week.total)}`}
            >
              {money(week.total, currency, { digits: 2 })}
            </span>
            <span className={`mt-0.5 text-foreground/70 ${compact ? "text-[0.5rem]" : "text-[0.6875rem]"}`}>
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
    <div className="py-8">
      <h3 data-share-item className="text-3xl font-extrabold uppercase">
        {title}
      </h3>
      <p data-share-item className={`mt-6 text-5xl font-bold tabular-nums ${tone(bucket.value)}`}>
        {money(bucket.value, currency, { signed: true })}
      </p>
      <div className="mt-6 flex gap-8 text-sm">
        <span data-share-item>
          <span className="block text-muted-foreground">Positions</span>
          <span className="text-lg font-semibold tabular-nums">{bucket.positions}</span>
        </span>
        <span data-share-item>
          <span className="block text-muted-foreground">Win rate</span>
          <span className="text-lg font-semibold tabular-nums">
            {bucket.positions ? pct(bucket.wins / bucket.positions, 1) : "—"}
          </span>
        </span>
        {days !== undefined && (
          <span data-share-item>
            <span className="block text-muted-foreground">Active days</span>
            <span className="text-lg font-semibold tabular-nums">{days}</span>
          </span>
        )}
      </div>
    </div>
  );
}
