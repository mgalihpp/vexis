import { Link } from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  BanIcon,
  BarChart3Icon,
  ChevronDownIcon,
  CircleDollarSignIcon,
  DropletsIcon,
  FilterIcon,
  FootprintsIcon,
  type LucideIcon,
  ShieldAlertIcon,
  SnowflakeIcon,
  TagIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { age } from "@/features/analytics/analytics";
import { Updated } from "@/features/analytics/components/ui";
import { Badge, TokenIcon, tradeLinks } from "@/features/portfolio/components/pool-identity";
import { Segmented } from "@/features/portfolio/components/segmented";
import { PoolFilter } from "@/features/portfolio/components/table-controls";
import { compactUsd } from "@/features/portfolio/money";
import {
  apr,
  FLOOR,
  feePace,
  momentum,
  type Screener,
  type ScreenerPool,
  SORT_KEYS,
  SORTS,
  type SortDir,
  type SortKey,
  STEP_BANDS,
  type StepBand,
  screen,
  TVL_STEPS,
  totals,
  turnover,
  VOLUME_STEPS,
  type WarningKind,
  warnings,
} from "../screener";

export interface ScreenerView {
  sort: SortKey;
  dir: SortDir;
  tvl: number;
  vol: number;
  step: StepBand | "all";
  q: string;
  bl: boolean;
}

export const SCREENER_DEFAULTS: ScreenerView = {
  sort: "feeTvl24h",
  dir: "desc",
  tvl: 10_000,
  vol: 5_000,
  step: "all",
  q: "",
  bl: false,
};

const PAGE = 50;
const DASH = "—";

const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const solText = (usd: number, solPrice: number | null) =>
  solPrice ? `${compactFmt.format(usd / solPrice)} SOL` : DASH;

/** `12.4%`, `0.21%`, `0.004%`: enough digits that a small ratio never reads as zero. */
function percent(v: number | null) {
  if (v === null) return DASH;
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : v >= 0.1 || v === 0 ? 2 : 3;
  return `${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}
const times = (v: number | null) => (v === null ? DASH : `${v >= 10 ? v.toFixed(1) : v.toFixed(2)}×`);

const WARNING_ICON: Record<WarningKind, { Icon: LucideIcon; tone: string }> = {
  blacklisted: { Icon: BanIcon, tone: "text-loss" },
  unverified: { Icon: ShieldAlertIcon, tone: "text-amber-600 dark:text-amber-400" },
  freezable: { Icon: SnowflakeIcon, tone: "text-sky-600 dark:text-sky-400" },
  tag: { Icon: TagIcon, tone: "text-muted-foreground" },
};

// One template for the header and every row, so the columns line up without a <table>; a row is a single link.
const GRID =
  "grid items-center gap-x-4 px-3 grid-cols-[1.5rem_minmax(11rem,1.7fr)_6.5rem_8.5rem_4.5rem_6.5rem_6.5rem_4.5rem] xl:grid-cols-[1.5rem_minmax(16rem,1.7fr)_7rem_9rem_5.5rem_5rem_7rem_7rem_5rem_5rem]";

const COLUMNS: { key: SortKey | null; label: string; hint?: string; className?: string }[] = [
  { key: null, label: "#" },
  { key: "name", label: "Pool" },
  {
    key: "feeTvl24h",
    label: "Fee/TVL 24h",
    hint: "Fees paid in 24h as a share of the pool's TVL",
    className: "justify-end",
  },
  {
    key: "momentum",
    label: "Fee pace",
    hint: "Fee/TVL per hour from 24h ago to now, and the last hour against the day's average",
  },
  { key: "feeTvl1h", label: "1h", hint: "Fee/TVL in the last hour", className: "hidden justify-end xl:flex" },
  { key: "feeTvl24h", label: "APR", hint: "24h Fee/TVL times 365, not compounded", className: "justify-end" },
  { key: "volume", label: "Volume 24h", className: "justify-end" },
  { key: "tvl", label: "TVL", className: "justify-end" },
  { key: "turnover", label: "Vol/TVL", hint: "24h volume divided by TVL", className: "justify-end" },
  { key: "age", label: "Age", className: "hidden justify-end xl:flex" },
];

export function ScreenerPage({
  data,
  solPrice,
  view,
  onView,
}: {
  data: Screener;
  solPrice: number | null;
  view: ScreenerView;
  onView: (patch: Partial<ScreenerView>) => void;
}) {
  // The box keeps its own text so typing never waits for the URL; the URL follows on every change.
  const [query, setQuery] = useState(view.q);
  const [shown, setShown] = useState(PAGE);
  const change = (patch: Partial<ScreenerView>) => {
    setShown(PAGE);
    if (patch.q !== undefined) setQuery(patch.q);
    onView(patch);
  };

  const filters = { minTvl: view.tvl, minVolume: view.vol, step: view.step, query, blacklisted: view.bl };
  const rows = screen(data.pools, filters, view.sort, view.dir);
  const sum = totals(rows);
  const top = rows.reduce((max, p) => Math.max(max, p.feeTvl["24h"]), 0);
  const visible = rows.slice(0, shown);
  const blacklisted = data.pools.filter((p) => p.blacklisted).length;
  const active = (Object.keys(SCREENER_DEFAULTS) as (keyof ScreenerView)[]).filter(
    (k) => k !== "sort" && k !== "dir" && view[k] !== SCREENER_DEFAULTS[k],
  ).length;
  const sortBy = (key: SortKey) =>
    change(
      view.sort === key
        ? { dir: view.dir === "desc" ? "asc" : "desc" }
        : { sort: key, dir: key === "name" ? "asc" : "desc" },
    );

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-3 p-2 pb-6 md:p-4">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h1 className="font-brand text-xl font-bold tracking-tight md:text-2xl">Pool screener</h1>
        <Updated at={data.at} />
      </header>

      <dl className="grid grid-cols-2 overflow-hidden rounded-[10px] border bg-card sm:grid-cols-4">
        <Total label="Pools" value={`${rows.length}`} sub={`of ${data.pools.length} above $1K`} />
        <Total label="TVL" value={compactUsd(sum.tvl)} sub={solText(sum.tvl, solPrice)} />
        <Total label="Volume 24h" value={compactUsd(sum.volume24h)} sub={solText(sum.volume24h, solPrice)} />
        <Total
          label="Fees 24h"
          value={compactUsd(sum.fees24h)}
          sub={`${solText(sum.fees24h, solPrice)} · ${percent(sum.feeTvl)} of TVL`}
        />
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <PoolFilter value={query} onChange={(q) => change({ q })} placeholder="Filter by token, pair or address" />
        <Popover>
          <PopoverTrigger
            aria-label="Filters"
            className={`relative p-1.25 hover:text-foreground ${active ? "text-brand" : "text-foreground/80"}`}
          >
            <FilterIcon className="size-3.25" />
            {active > 0 && (
              <span className="num absolute -top-0.5 -right-1 rounded-full bg-brand px-1 text-[0.5rem] leading-3 font-bold text-brand-foreground">
                {active}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[min(19rem,calc(100vw-1rem))] gap-0 p-1.5"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between px-0.75 pb-1.5 text-xs font-semibold">
              Filters
              {active > 0 && (
                <button
                  type="button"
                  className="text-[0.625rem] font-normal text-brand"
                  onClick={() => change({ ...SCREENER_DEFAULTS, sort: view.sort, dir: view.dir })}
                >
                  Clear
                </button>
              )}
            </div>
            <FilterRow Icon={FootprintsIcon} label="Bin step">
              <Segmented value={view.step} options={STEP_OPTIONS} onChange={(step) => change({ step })} />
            </FilterRow>
            <FilterRow Icon={DropletsIcon} label="Minimum TVL">
              <Segmented
                value={String(view.tvl)}
                options={TVL_STEPS.map(minimumOption)}
                onChange={(tvl) => change({ tvl: Number(tvl) })}
              />
            </FilterRow>
            <FilterRow Icon={BarChart3Icon} label="Minimum volume 24h">
              <Segmented
                value={String(view.vol)}
                options={VOLUME_STEPS.map(minimumOption)}
                onChange={(vol) => change({ vol: Number(vol) })}
              />
            </FilterRow>
            <label
              htmlFor="screener-blacklisted"
              className="flex cursor-pointer items-center gap-1.5 rounded border-t px-0.75 pt-2 pb-1 text-xs hover:text-foreground"
            >
              <Checkbox
                id="screener-blacklisted"
                checked={view.bl}
                onCheckedChange={(on) => change({ bl: on === true })}
              />
              Show blacklisted pools
              <span className="num text-muted-foreground">{blacklisted}</span>
            </label>
          </PopoverContent>
        </Popover>
        <div className="ml-auto flex shrink-0 items-center gap-1.25">
          <Picker
            Icon={ArrowUpDownIcon}
            label="Sort"
            align="end"
            value={view.sort}
            options={SORT_KEYS.map((key) => ({ value: key, label: SORTS[key].label }))}
            onChange={(sort) => change({ sort, dir: sort === "name" ? "asc" : "desc" })}
          />
          <button
            type="button"
            aria-label={view.dir === "desc" ? "Highest first" : "Lowest first"}
            onClick={() => change({ dir: view.dir === "desc" ? "asc" : "desc" })}
            className="flex size-6.5 items-center justify-center rounded-md border text-foreground/80 hover:bg-muted hover:text-foreground"
          >
            {view.dir === "desc" ? <ArrowDownIcon className="size-3.25" /> : <ArrowUpIcon className="size-3.25" />}
          </button>
        </div>
      </div>

      {data.total > data.pools.length && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          Meteora has {data.total} pools above the floor; the {data.pools.length} with the most TVL are listed.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[10px] border border-dashed px-4 py-12 text-center">
          <p className="text-sm font-medium">No pool passes these filters</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Lower a minimum, widen the bin step or clear the search. Pools under ${FLOOR.tvl.toLocaleString("en-US")}{" "}
            TVL or 24h volume are never listed.
          </p>
          <Button variant="outline" size="sm" onClick={() => change(SCREENER_DEFAULTS)}>
            Reset filters
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden rounded-[10px] border bg-card lg:block">
            <div
              className={`${GRID} sticky top-0 z-10 h-9 rounded-t-[10px] border-b bg-card/95 text-[11px] font-medium text-muted-foreground backdrop-blur`}
            >
              {COLUMNS.map((c) => (
                <HeaderCell key={c.label} column={c} view={view} onSort={sortBy} />
              ))}
            </div>
            {visible.map((p, i) => (
              <PoolRow key={p.address} pool={p} rank={i + 1} top={top} now={data.at} solPrice={solPrice} />
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:hidden">
            {visible.map((p, i) => (
              <PoolCard key={p.address} pool={p} rank={i + 1} top={top} now={data.at} solPrice={solPrice} />
            ))}
          </div>

          {rows.length > shown && (
            <Button variant="outline" className="self-center" onClick={() => setShown(shown + PAGE)}>
              Show {Math.min(PAGE, rows.length - shown)} more of {rows.length - shown}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function Total({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-border p-3 not-last:border-r max-sm:nth-[2]:border-r-0 max-sm:nth-[-n+2]:border-b">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="num truncate text-base font-semibold">{value}</dd>
      <dd className="num truncate text-[11px] text-muted-foreground">{sub}</dd>
    </div>
  );
}

const STEP_OPTIONS = [
  { value: "all" as const, label: "All" },
  ...STEP_BANDS.map((b) => ({ value: b.id, label: b.label })),
];
const minimumOption = (value: number) => ({ value: String(value), label: `$${compactFmt.format(value)}` });

function FilterRow({ Icon, label, children }: { Icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1 px-0.75 pb-2.5">
      <span className="flex items-center gap-1 text-[0.625rem] text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </span>
      {children}
    </div>
  );
}

/** A filter with a short list of choices, in the look of the portfolio's range picker. */
function Picker<T extends string | number>({
  Icon,
  label,
  value,
  options,
  onChange,
  align = "start",
}: {
  Icon: LucideIcon;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-6.5 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs">
        <Icon className="size-3.25" />
        <span className="font-semibold">{label}</span>
        <span className="num text-foreground/80">{options.find((o) => o.value === value)?.label}</span>
        <ChevronDownIcon className="size-3.25" />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-40 p-0.75">
        <ul>
          {options.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full rounded-md px-2 py-1.25 text-left text-xs whitespace-nowrap ${
                  o.value === value ? "bg-brand text-brand-foreground" : "hover:bg-muted"
                }`}
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function HeaderCell({
  column,
  view,
  onSort,
}: {
  column: (typeof COLUMNS)[number];
  view: ScreenerView;
  onSort: (key: SortKey) => void;
}) {
  const { key, label, hint, className = "" } = column;
  if (!key) return <span className={className}>{label}</span>;
  // APR is the 24h ratio scaled, so it shares that sort; only the Fee/TVL header shows the arrow.
  const active = view.sort === key && label !== "APR";
  const Arrow = view.dir === "desc" ? ArrowDownIcon : ArrowUpIcon;
  return (
    <button
      type="button"
      title={hint}
      aria-label={`Sort by ${label}`}
      onClick={() => onSort(key)}
      className={`flex items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground ${active ? "text-foreground" : ""} ${className}`}
    >
      {label}
      {active && <Arrow className="size-3 text-brand" />}
    </button>
  );
}

interface RowProps {
  pool: ScreenerPool;
  rank: number;
  /** The highest 24h Fee/TVL in the list, the full width of the heat bar. */
  top: number;
  now: number;
  solPrice: number | null;
}

function Pair({ pool, size }: { pool: ScreenerPool; size: string }) {
  return (
    <span className="flex shrink-0 items-center">
      <TokenIcon token={pool.tokenX} className={`relative z-10 ring-2 ring-card ${size}`} />
      <TokenIcon token={pool.tokenY} className={`-ml-1.5 ${size}`} />
    </span>
  );
}

function PoolChips({ pool }: { pool: ScreenerPool }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <Badge tone="blue" title="Bin step">
        <FootprintsIcon className="size-3.5" />
        {pool.binStep}
      </Badge>
      <Badge tone="orange" title="Base fee">
        <CircleDollarSignIcon className="size-3.5" />
        {percent(pool.baseFeePct)}
      </Badge>
    </span>
  );
}

/** Fee/TVL with a bar under it. The square root keeps mid-table pools visible next to one runaway pool. */
function Heat({ value, top, className = "" }: { value: number; top: number; className?: string }) {
  const width = top > 0 ? Math.sqrt(value / top) * 100 : 0;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="num font-semibold">{percent(value)}</span>
      <span className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-brand" style={{ width: `${width}%` }} />
      </span>
    </div>
  );
}

/** Six bars, 24h ago on the left and the last 30 minutes on the right; a bar above the day's average is lime. */
function Pace({ pool }: { pool: ScreenerPool }) {
  const pace = feePace(pool.feeTvl);
  const average = pool.feeTvl["24h"] / 24;
  const peak = Math.max(...pace);
  const m = momentum(pool.feeTvl);
  const tone =
    m === null ? "text-muted-foreground" : m >= 1.25 ? "text-profit" : m < 0.75 ? "text-muted-foreground" : "";
  return (
    <div
      className="relative z-10 flex items-end gap-2"
      title={m === null ? "No fees in the last 24h" : `Last hour is ${times(m)} the 24h hourly average`}
    >
      <span className="flex h-5 items-end gap-0.5" aria-hidden="true">
        {pace.map((rate, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: six fixed stretches of time, never reordered
            key={i}
            className={`w-1.5 rounded-[1px] ${rate > average ? "bg-brand" : "bg-foreground/25"}`}
            style={{ height: `${peak > 0 ? Math.max(10, (rate / peak) * 100) : 10}%` }}
          />
        ))}
      </span>
      <span className={`num text-[11px] font-medium ${tone}`}>{times(m)}</span>
    </div>
  );
}

function Money({ usd, solPrice }: { usd: number; solPrice: number | null }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="num font-medium">{compactUsd(usd)}</span>
      <span className="num text-[10px] text-muted-foreground">{solText(usd, solPrice)}</span>
    </div>
  );
}

function TradeIcons({ pool }: { pool: ScreenerPool }) {
  return (
    <span className="relative z-10 flex shrink-0 items-center gap-1.5">
      {tradeLinks(pool.tokenX.mint, pool.tokenY.mint).map((l) => (
        <a
          key={l.name}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          aria-label={`${pool.name} on ${l.name}`}
          title={l.name}
          className="opacity-80 transition-opacity hover:opacity-100"
        >
          <img src={l.logo} alt="" className="size-3.5 rounded-[0.15rem]" />
        </a>
      ))}
    </span>
  );
}

/** Covers the whole row so it opens Analytics, while the trade links above it stay separate anchors. */
function RowLink({ pool }: { pool: ScreenerPool }) {
  return (
    <Link
      to="/analytics"
      search={{ pool: pool.address }}
      aria-label={`${pool.name} analytics`}
      className="absolute inset-0 rounded-[inherit] focus-visible:outline-none"
    />
  );
}

function PoolRow({ pool, rank, top, now, solPrice }: RowProps) {
  const flags = warnings(pool);
  return (
    <div
      className={`${GRID} group relative isolate h-12 border-b text-xs transition-colors last:rounded-b-[10px] last:border-b-0 focus-within:bg-muted/50 hover:bg-muted/50`}
    >
      <RowLink pool={pool} />
      <span className="num text-[11px] text-muted-foreground">{rank}</span>
      <span className="flex min-w-0 items-center gap-2">
        <Pair pool={pool} size="size-5 text-[9px]" />
        <span className="truncate font-semibold group-hover:text-brand">{pool.name}</span>
        <PoolChips pool={pool} />
        {flags.map((w) => {
          const { Icon, tone } = WARNING_ICON[w.kind];
          return (
            <span key={w.label} title={w.detail} className={`relative z-10 shrink-0 ${tone}`}>
              <Icon className="size-3.5" aria-label={w.detail} />
            </span>
          );
        })}
        <span className="ml-auto pl-1">
          <TradeIcons pool={pool} />
        </span>
      </span>
      <Heat value={pool.feeTvl["24h"]} top={top} className="items-end" />
      <Pace pool={pool} />
      <span className="num hidden justify-end xl:flex">{percent(pool.feeTvl["1h"])}</span>
      <span className="num text-right">{percent(apr(pool.feeTvl))}</span>
      <Money usd={pool.volume24h} solPrice={solPrice} />
      <Money usd={pool.tvl} solPrice={solPrice} />
      <span className="num text-right">{times(turnover(pool))}</span>
      <span className="num hidden justify-end text-muted-foreground xl:flex">{age(pool.createdAt, now)}</span>
    </div>
  );
}

function PoolCard({ pool, rank, top, now, solPrice }: RowProps) {
  const flags = warnings(pool);
  return (
    <div className="relative isolate flex flex-col gap-3 rounded-[10px] border bg-card p-3 text-xs transition-colors active:bg-muted/60">
      <RowLink pool={pool} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Pair pool={pool} size="size-8 text-xs" />
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate text-sm font-semibold">{pool.name}</span>
              <span className="num shrink-0 text-[11px] text-muted-foreground">
                #{rank} · {age(pool.createdAt, now)}
              </span>
            </div>
            <div className="mt-1">
              <PoolChips pool={pool} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <Heat value={pool.feeTvl["24h"]} top={top} className="w-20 items-end text-base" />
          <span className="mt-1 text-[10px] text-muted-foreground">Fee/TVL 24h</span>
        </div>
      </div>

      <div className="flex items-start gap-2">
        <ul className="flex flex-wrap gap-1">
          {flags.map((w) => {
            const { Icon, tone } = WARNING_ICON[w.kind];
            return (
              <li key={w.label} className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${tone}`}>
                <Icon className="size-3" />
                {w.label}
              </li>
            );
          })}
        </ul>
        <span className="ml-auto pt-0.5">
          <TradeIcons pool={pool} />
        </span>
      </div>

      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5 border-t pt-2.5">
        <CardStat label="Volume 24h">
          <Money usd={pool.volume24h} solPrice={solPrice} />
        </CardStat>
        <CardStat label="TVL">
          <Money usd={pool.tvl} solPrice={solPrice} />
        </CardStat>
        <CardStat label="Fee pace">
          <Pace pool={pool} />
        </CardStat>
        <CardStat label="APR">
          <span className="num font-medium">{percent(apr(pool.feeTvl))}</span>
        </CardStat>
        <CardStat label="Vol/TVL">
          <span className="num font-medium">{times(turnover(pool))}</span>
        </CardStat>
        <CardStat label="Fee/TVL 1h">
          <span className="num font-medium">{percent(pool.feeTvl["1h"])}</span>
        </CardStat>
      </div>
    </div>
  );
}

function CardStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-0.5 [&>div]:items-start">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
