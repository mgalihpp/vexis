import { ShareIcon } from "lucide-react";
import { type ReactNode, useId, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { money, tone } from "../money";
import {
  type ClosedPosition,
  type Currency,
  cumulative,
  dailyBuckets,
  type Granularity,
  type Metric,
  series,
} from "../portfolio";
import { METRIC_OPTIONS, Segmented } from "./segmented";
import { ShareDialog } from "./share-dialog";
import { Panel } from "./summary-panels";

const config = { value: { label: "P&L" } } satisfies ChartConfig;

const PROFIT = "var(--profit)";
const LOSS = "var(--loss)";

const monthTick = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
const dayLabel = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const axisMoney = (currency: Currency) => (v: number) =>
  currency === "sol" ? `${v.toFixed(2)} SOL` : `$${Math.round(v).toLocaleString("en-US")}`;

function rangeTitle(points: { start: number }[]) {
  const first = points[0]?.start;
  const last = points.at(-1)?.start;
  if (first === undefined || last === undefined) return "No data";
  const md = (ms: number) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${md(first)} – ${md(last)}, ${new Date(last).getUTCFullYear()}`;
}

function ChartTooltip({
  active,
  payload,
  currency,
  formatLabel,
}: {
  active?: boolean;
  payload?: { payload: { start: number; value: number } }[];
  currency: Currency;
  formatLabel: (ms: number) => string;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="text-muted-foreground">{formatLabel(point.start)}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${tone(point.value)}`}>
        {money(point.value, currency, { signed: true })}
      </div>
    </div>
  );
}

function ChartPanel({
  title,
  controls,
  onShare,
  children,
}: {
  title: string;
  controls: ReactNode;
  onShare: () => void;
  children: ReactNode;
}) {
  return (
    <Panel className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-lg font-semibold">
          {title}
          <button
            type="button"
            aria-label={`Share ${title}`}
            onClick={onShare}
            className="text-foreground/60 hover:text-foreground"
          >
            <ShareIcon className="size-[1.125rem]" />
          </button>
        </h2>
        <div className="flex flex-wrap items-center gap-3">{controls}</div>
      </div>
      {children}
    </Panel>
  );
}

function CumulativeArea({ data, currency }: { data: { start: number; value: number }[]; currency: Currency }) {
  const id = useId().replace(/:/g, "");
  const values = data.map((d) => d.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  // Fraction from the top where y = 0 sits, so one gradient paints green above and red below.
  const zero = max === min ? 1 : max / (max - min);
  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`stroke-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={zero} stopColor={PROFIT} />
            <stop offset={zero} stopColor={LOSS} />
          </linearGradient>
          <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset={0} stopColor={PROFIT} stopOpacity={0.55} />
            <stop offset={zero} stopColor={PROFIT} stopOpacity={0.08} />
            <stop offset={zero} stopColor={LOSS} stopOpacity={0.08} />
            <stop offset={1} stopColor={LOSS} stopOpacity={0.4} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="0" />
        <XAxis
          dataKey="start"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={monthTick}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tickMargin={8}
        />
        <YAxis tickFormatter={axisMoney(currency)} tickLine={false} axisLine={false} width={78} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
        <Tooltip content={<ChartTooltip currency={currency} formatLabel={dayLabel} />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={`url(#stroke-${id})`}
          strokeWidth={2}
          fill={`url(#fill-${id})`}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function PeriodBars({
  data,
  currency,
  label,
}: {
  data: { start: number; value: number }[];
  currency: Currency;
  label: (ms: number) => string;
}) {
  return (
    <ChartContainer config={config} className="aspect-auto h-full w-full">
      <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="start"
          tickFormatter={monthTick}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tickMargin={8}
        />
        <YAxis tickFormatter={axisMoney(currency)} tickLine={false} axisLine={false} width={78} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.5} />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={<ChartTooltip currency={currency} formatLabel={label} />}
        />
        <Bar dataKey="value" isAnimationActive={false} maxBarSize={18}>
          {data.map((d) => (
            <Cell key={d.start} fill={d.value >= 0 ? PROFIT : LOSS} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function ShareHeader({
  title,
  subtitle,
  total,
  currency,
}: {
  title: string;
  subtitle: string;
  total: number;
  currency: Currency;
}) {
  return (
    <div className="mt-4 mb-4">
      <h3 data-share-item className="text-3xl font-extrabold uppercase">
        {title}
      </h3>
      <p data-share-item className="mt-1 font-semibold">
        {subtitle}
      </p>
      <p data-share-item className="mt-2 text-2xl font-semibold">
        Total <span className={`font-bold tabular-nums ${tone(total)}`}>{money(total, currency)}</span>
      </p>
    </div>
  );
}

export function CumulativeChart({ closed, currency }: { closed: ClosedPosition[]; currency: Currency }) {
  const [metric, setMetric] = useState<Metric>("pnl");
  const [sharing, setSharing] = useState(false);
  const data = useMemo(() => cumulative(dailyBuckets(closed, currency, metric)), [closed, currency, metric]);
  const total = data.at(-1)?.value ?? 0;
  return (
    <ChartPanel
      title="Cumulative P&L"
      onShare={() => setSharing(true)}
      controls={<Segmented value={metric} options={METRIC_OPTIONS} onChange={setMetric} />}
    >
      <div className="mt-6 h-[22.5rem]">
        {data.length ? <CumulativeArea data={data} currency={currency} /> : <Empty />}
      </div>
      <ShareDialog
        open={sharing}
        onOpenChange={setSharing}
        hint="Click any section to hide or restore it"
        title="Cumulative P&L"
      >
        <ShareHeader title={rangeTitle(data)} subtitle="Cumulative P&L" total={total} currency={currency} />
        <div data-share-item className="h-[13.75rem]">
          <CumulativeArea data={data} currency={currency} />
        </div>
      </ShareDialog>
    </ChartPanel>
  );
}

const GRANULARITY = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;

export function PeriodChart({ closed, currency }: { closed: ClosedPosition[]; currency: Currency }) {
  const [metric, setMetric] = useState<Metric>("pnl");
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [sharing, setSharing] = useState(false);
  const data = useMemo(
    () => series(dailyBuckets(closed, currency, metric), granularity),
    [closed, currency, metric, granularity],
  );
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const title = `${GRANULARITY.find((g) => g.value === granularity)?.label} P&L`;
  const label =
    granularity === "monthly"
      ? monthTick
      : (ms: number) => (granularity === "weekly" ? `Week of ${dayLabel(ms)}` : dayLabel(ms));
  return (
    <ChartPanel
      title={title}
      onShare={() => setSharing(true)}
      controls={
        <>
          <Segmented value={granularity} options={GRANULARITY} onChange={setGranularity} variant="muted" />
          <Segmented value={metric} options={METRIC_OPTIONS} onChange={setMetric} />
        </>
      }
    >
      <div className="mt-6 h-[22.5rem]">
        {data.length ? <PeriodBars data={data} currency={currency} label={label} /> : <Empty />}
      </div>
      <ShareDialog
        open={sharing}
        onOpenChange={setSharing}
        hint="Click any section to hide or restore it"
        title={title}
      >
        <ShareHeader title={rangeTitle(data)} subtitle={title} total={total} currency={currency} />
        <div data-share-item className="h-[13.75rem]">
          <PeriodBars data={data} currency={currency} label={label} />
        </div>
      </ShareDialog>
    </ChartPanel>
  );
}

function Empty() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No closed positions in this range.
    </div>
  );
}
