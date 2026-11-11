import { Link } from "@tanstack/react-router";
import {
  ActivityIcon,
  ArrowDownIcon,
  ArrowLeftRightIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ArrowUpRightIcon,
  BanIcon,
  BarChart3Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleDollarSignIcon,
  ClockIcon,
  CoinsIcon,
  DropletsIcon,
  FilterIcon,
  FootprintsIcon,
  type LucideIcon,
  ShieldAlertIcon,
  SlidersHorizontalIcon,
  SnowflakeIcon,
  TagIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { age } from "@/features/analytics/analytics";
import { Updated } from "@/features/analytics/components/ui";
import { Badge, TokenIcon, tradeLinks } from "@/features/portfolio/components/pool-identity";
import { Segmented } from "@/features/portfolio/components/segmented";
import { PoolFilter } from "@/features/portfolio/components/table-controls";
import { compactUsd, tone } from "@/features/portfolio/money";
import {
  apr,
  baseToken,
  CONCENTRATED_PCT,
  type FeeWindow,
  FLOOR,
  feePace,
  MCAP_MAX_STEPS,
  MCAP_MIN_STEPS,
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
  WINDOWS,
  warnings,
} from "../screener";

export interface ScreenerView {
  sort: SortKey;
  dir: SortDir;
  /** The window the Volume column, its sort and the volume total show. */
  win: FeeWindow;
  tvl: number;
  vol: number;
  mcap: number;
  mcapMax: number;
  step: StepBand | "all";
  q: string;
  bl: boolean;
}

export const SCREENER_DEFAULTS: ScreenerView = {
  sort: "feeTvl24h",
  dir: "desc",
  win: "24h",
  tvl: 10_000,
  vol: 5_000,
  mcap: 0,
  mcapMax: 0,
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
const signedPct = (v: number | null) =>
  v === null ? DASH : `${v > 0 ? "+" : ""}${Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)}%`;
const toneOf = (v: number | null) => (v === null ? "text-muted-foreground" : tone(v));
const signedUsd = (v: number) => `${v > 0 ? "+" : ""}${compactUsd(v)}`;
const signedSol = (usd: number, solPrice: number | null) =>
  solPrice ? `${usd > 0 ? "+" : ""}${compactFmt.format(usd / solPrice)} SOL` : DASH;
const count = (v: number | null) => (v === null ? DASH : compactFmt.format(v));
const compact = (v: number) => compactFmt.format(v);

/** A number that moves when a refetch changes it (Settings → Numbers), or a dash when it is unknown. */
function Num({ value, format }: { value: number | null | undefined; format: (v: number) => string }) {
  return value == null || !Number.isFinite(value) ? DASH : <AnimatedNumber value={value} format={format} />;
}

const WARNING_ICON: Record<WarningKind, { Icon: LucideIcon; tone: string }> = {
  blacklisted: { Icon: BanIcon, tone: "text-loss" },
  unverified: { Icon: ShieldAlertIcon, tone: "text-amber-600 dark:text-amber-400" },
  freezable: { Icon: SnowflakeIcon, tone: "text-sky-600 dark:text-sky-400" },
  mintable: { Icon: CoinsIcon, tone: "text-amber-600 dark:text-amber-400" },
  concentrated: { Icon: UsersIcon, tone: "text-orange-600 dark:text-orange-400" },
  tag: { Icon: TagIcon, tone: "text-muted-foreground" },
};

// One template for the header and every row, so the columns line up without a <table>; a row is a single link.
const GRID =
  "grid items-center gap-x-3 px-3 grid-cols-[1.5rem_minmax(11rem,1.7fr)_6.5rem_8.5rem_4.5rem_6.5rem_6.5rem_4.5rem_1.25rem] xl:grid-cols-[1.5rem_minmax(12rem,1.7fr)_7.5rem_6.5rem_8.5rem_4.5rem_6.5rem_6.5rem_6rem_4.5rem_1.25rem]";

const COLUMNS: { key: SortKey | null; label: string; hint?: string; className?: string }[] = [
  { key: null, label: "#" },
  { key: "name", label: "Pool" },
  {
    key: "priceChange",
    label: "Price 24h",
    hint: "Pool price over the last 24h and its change",
    className: "hidden xl:flex",
  },
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
  { key: "feeTvl24h", label: "APR", hint: "24h Fee/TVL times 365, not compounded", className: "justify-end" },
  { key: "volume", label: "Volume", className: "justify-end" },
  { key: "tvl", label: "TVL", className: "justify-end" },
  {
    key: "netDeposits",
    label: "Net flow",
    hint: "Liquidity deposited minus withdrawn in 24h",
    className: "hidden justify-end xl:flex",
  },
  { key: "turnover", label: "Vol/TVL", hint: "24h volume divided by TVL", className: "justify-end" },
  { key: null, label: "" },
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
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (address: string) => {
    const next = new Set(open);
    if (!next.delete(address)) next.add(address);
    setOpen(next);
  };
  const change = (patch: Partial<ScreenerView>) => {
    setShown(PAGE);
    if (patch.q !== undefined) setQuery(patch.q);
    onView(patch);
  };

  const filters = {
    minTvl: view.tvl,
    minVolume: view.vol,
    minMcap: view.mcap,
    maxMcap: view.mcapMax,
    window: view.win,
    step: view.step,
    query,
    blacklisted: view.bl,
  };
  const rows = screen(data.pools, filters, view.sort, view.dir);
  const sol = (usd: number) => solText(usd, solPrice);
  const sum = totals(rows, view.win);
  const top = rows.reduce((max, p) => Math.max(max, p.feeTvl["24h"]), 0);
  const visible = rows.slice(0, shown);
  const blacklisted = data.pools.filter((p) => p.blacklisted).length;
  const noStats = data.pools.length > 0 && data.pools.every((p) => !p.stats);
  const active = (Object.keys(SCREENER_DEFAULTS) as (keyof ScreenerView)[]).filter(
    (k) => !VIEW_ONLY.has(k) && view[k] !== SCREENER_DEFAULTS[k],
  ).length;
  const clear = () => change({ ...SCREENER_DEFAULTS, sort: view.sort, dir: view.dir, win: view.win });
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

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border bg-border sm:grid-cols-3 xl:grid-cols-6">
        <Total
          label="Pools"
          value={<Num value={rows.length} format={(v) => String(Math.round(v))} />}
          sub={`of ${data.pools.length} above $1K`}
        />
        <Total
          label="TVL"
          value={<Num value={sum.tvl} format={compactUsd} />}
          sub={<Num value={sum.tvl} format={sol} />}
        />
        <Total
          label={`Volume ${view.win}`}
          value={<Num value={sum.volume} format={compactUsd} />}
          sub={<Num value={sum.volume} format={sol} />}
        />
        <Total
          label="Fees 24h"
          value={<Num value={sum.fees24h} format={compactUsd} />}
          sub={<Num value={sum.fees24h} format={sol} />}
          badge={sum.feeTvl === null ? undefined : `${percent(sum.feeTvl)} of TVL`}
        />
        <Total
          label="Swaps 24h"
          value={<Num value={sum.swaps} format={compact} />}
          sub={`${times(sum.turnover)} volume/TVL`}
        />
        <Total
          label="Net deposits 24h"
          value={<Num value={sum.netDeposits} format={signedUsd} />}
          sub={<Num value={sum.netDeposits} format={(v) => signedSol(v, solPrice)} />}
          className={sum.netDeposits === null ? "" : tone(sum.netDeposits)}
        />
      </dl>

      <div className="flex items-center gap-2">
        <PoolFilter value={query} onChange={(q) => change({ q })} placeholder="Filter by token, pair or address" />
        <div className="ml-auto flex shrink-0 items-center gap-1.25 max-md:hidden">
          <Segmented value={view.win} options={WINDOW_OPTIONS} variant="muted" onChange={(win) => change({ win })} />
          <Popover>
            <PopoverTrigger
              aria-label="Filters"
              className={`relative flex size-6.5 items-center justify-center rounded-md border hover:bg-muted hover:text-foreground ${active ? "border-brand/60 text-brand" : "text-foreground/80"}`}
            >
              <FilterIcon className="size-3.25" />
              {active > 0 && (
                <span className="num absolute -top-0.5 -right-1 rounded-full bg-brand px-1 text-[0.5rem] leading-3 font-bold text-brand-foreground">
                  {active}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[min(21rem,calc(100vw-1rem))] gap-0 p-1.5"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="flex items-center justify-between px-0.75 pb-1.5 text-xs font-semibold">
                Filters
                {active > 0 && (
                  <button type="button" className="text-[0.625rem] font-normal text-brand" onClick={clear}>
                    Clear
                  </button>
                )}
              </div>
              <FilterFields view={view} change={change} blacklisted={blacklisted} touch={false} />
            </PopoverContent>
          </Popover>
          <Picker
            Icon={ArrowUpDownIcon}
            label="Sort"
            align="end"
            value={view.sort}
            options={SORT_KEYS.map((key) => ({ value: key, label: sortLabel(key, view.win) }))}
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
        <MobileControls
          view={view}
          change={change}
          active={active}
          clear={clear}
          shown={rows.length}
          blacklisted={blacklisted}
        />
      </div>

      {data.total > data.pools.length && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          Meteora has {data.total} pools above the floor; the {data.pools.length} with the most TVL are listed.
        </p>
      )}

      {noStats && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          Meteora's discovery API did not answer, so price trend, flow, activity and token figures show a dash.
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
              <PoolRow
                key={p.address}
                pool={p}
                rank={i + 1}
                top={top}
                now={data.at}
                solPrice={solPrice}
                win={view.win}
                open={open.has(p.address)}
                onToggle={() => toggle(p.address)}
              />
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:hidden">
            {visible.map((p, i) => (
              <PoolCard
                key={p.address}
                pool={p}
                rank={i + 1}
                top={top}
                now={data.at}
                solPrice={solPrice}
                win={view.win}
              />
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

function Total({
  label,
  value,
  sub,
  badge,
  className = "",
}: {
  label: string;
  value: ReactNode;
  sub: ReactNode;
  badge?: string;
  className?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-card p-3">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1.5">
        <span className={`num truncate text-base font-semibold ${className}`}>{value}</span>
        {badge && (
          <span className="num shrink-0 rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">
            {badge}
          </span>
        )}
      </dd>
      <dd className="num truncate text-[11px] text-muted-foreground">{sub}</dd>
    </div>
  );
}

/** Keys that change how the list is shown, not which pools are in it; Clear leaves them alone. */
const VIEW_ONLY = new Set<keyof ScreenerView>(["sort", "dir", "win"]);
const WINDOW_OPTIONS = WINDOWS.map((w) => ({ value: w, label: w }));
const DIR_OPTIONS = [
  { value: "desc" as const, label: "Highest first" },
  { value: "asc" as const, label: "Lowest first" },
];
const sortLabel = (key: SortKey, win: FeeWindow, fallback?: string) =>
  key === "volume" ? `Volume ${win}` : (fallback ?? SORTS[key].label);
const boundOption = (value: number) => ({
  value: String(value),
  label: value === 0 ? "Any" : `$${compactFmt.format(value)}`,
});

type Change = (patch: Partial<ScreenerView>) => void;

/** Large pills for a touch screen, in place of the desktop's compact segmented control. */
function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
            o.value === value ? "border-brand bg-brand text-brand-foreground" : "text-foreground/80 active:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilterFields({
  view,
  change,
  blacklisted,
  touch,
}: {
  view: ScreenerView;
  change: Change;
  blacklisted: number;
  touch: boolean;
}) {
  const Choice = touch ? Chips : Segmented;
  return (
    <>
      <FilterRow Icon={FootprintsIcon} label="Bin step" touch={touch}>
        <Choice value={view.step} options={STEP_OPTIONS} onChange={(step) => change({ step })} />
      </FilterRow>
      <FilterRow Icon={DropletsIcon} label="Minimum TVL" touch={touch}>
        <Choice
          value={String(view.tvl)}
          options={TVL_STEPS.map(minimumOption)}
          onChange={(tvl) => change({ tvl: Number(tvl) })}
        />
      </FilterRow>
      <FilterRow Icon={BarChart3Icon} label="Minimum volume 24h" touch={touch}>
        <Choice
          value={String(view.vol)}
          options={VOLUME_STEPS.map(minimumOption)}
          onChange={(vol) => change({ vol: Number(vol) })}
        />
      </FilterRow>
      <FilterRow Icon={CoinsIcon} label="Market cap, at least" touch={touch}>
        <Choice
          value={String(view.mcap)}
          options={MCAP_MIN_STEPS.map(boundOption)}
          onChange={(mcap) => change({ mcap: Number(mcap) })}
        />
      </FilterRow>
      <FilterRow Icon={CoinsIcon} label="Market cap, at most" touch={touch}>
        <Choice
          value={String(view.mcapMax)}
          options={MCAP_MAX_STEPS.map(boundOption)}
          onChange={(mcapMax) => change({ mcapMax: Number(mcapMax) })}
        />
      </FilterRow>
      <label
        htmlFor={touch ? "screener-blacklisted-touch" : "screener-blacklisted"}
        className={`flex cursor-pointer items-center gap-1.5 rounded border-t px-0.75 hover:text-foreground ${touch ? "pt-4 text-sm" : "pt-2 pb-1 text-xs"}`}
      >
        <Checkbox
          id={touch ? "screener-blacklisted-touch" : "screener-blacklisted"}
          checked={view.bl}
          onCheckedChange={(on) => change({ bl: on === true })}
        />
        Show blacklisted pools
        <span className="num text-muted-foreground">{blacklisted}</span>
      </label>
    </>
  );
}

/** Below md every control lives in one bottom drawer, since small popovers are hard to use by touch. */
function MobileControls({
  view,
  change,
  active,
  clear,
  shown,
  blacklisted,
}: {
  view: ScreenerView;
  change: Change;
  active: number;
  clear: () => void;
  shown: number;
  blacklisted: number;
}) {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          className={`ml-auto flex h-7 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium md:hidden ${active ? "border-brand/60" : ""}`}
        >
          <SlidersHorizontalIcon className="size-3.5" />
          Filter & sort
          {active > 0 && (
            <span className="num rounded-full bg-brand px-1.5 text-[10px] leading-4 font-bold text-brand-foreground">
              {active}
            </span>
          )}
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[90vh]">
        <div className="flex items-center gap-3 border-b px-4 pt-2 pb-3">
          <DrawerTitle className="text-base">Filter & sort</DrawerTitle>
          {active > 0 && (
            <button type="button" onClick={clear} className="text-xs font-medium text-brand">
              Clear filters
            </button>
          )}
          <DrawerClose aria-label="Close" className="ml-auto text-muted-foreground">
            <XIcon className="size-5" />
          </DrawerClose>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
          <FilterRow Icon={ArrowUpDownIcon} label="Sort by" touch>
            <Chips
              value={view.sort}
              options={SORT_KEYS.map((key) => ({ value: key, label: sortLabel(key, view.win) }))}
              onChange={(sort) => change({ sort, dir: sort === "name" ? "asc" : "desc" })}
            />
            <Chips value={view.dir} options={DIR_OPTIONS} onChange={(dir) => change({ dir })} />
          </FilterRow>
          <FilterRow Icon={ClockIcon} label="Volume window" touch>
            <Chips value={view.win} options={WINDOW_OPTIONS} onChange={(win) => change({ win })} />
          </FilterRow>
          <FilterFields view={view} change={change} blacklisted={blacklisted} touch />
        </div>
        <div className="border-t p-3">
          <DrawerClose asChild>
            <Button className="w-full">Show {shown} pools</Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

const STEP_OPTIONS = [
  { value: "all" as const, label: "All" },
  ...STEP_BANDS.map((b) => ({ value: b.id, label: b.label })),
];
const minimumOption = (value: number) => ({ value: String(value), label: `$${compactFmt.format(value)}` });

function FilterRow({
  Icon,
  label,
  touch = false,
  children,
}: {
  Icon: LucideIcon;
  label: string;
  touch?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col items-start ${touch ? "gap-2" : "gap-1 px-0.75 pb-2.5"}`}>
      <span className={`flex items-center gap-1 text-muted-foreground ${touch ? "text-xs" : "text-[0.625rem]"}`}>
        <Icon className={touch ? "size-3.5" : "size-3"} />
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
        <span className="font-semibold max-sm:hidden">{label}</span>
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
  const { key, hint, className = "" } = column;
  const label = key ? sortLabel(key, view.win, column.label) : column.label;
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
  win: FeeWindow;
  open: boolean;
  onToggle: () => void;
}

function Pair({ pool, size }: { pool: ScreenerPool; size: string }) {
  return (
    <span className="flex shrink-0 items-center">
      <TokenIcon token={pool.tokenX} className={`relative z-10 ring-2 ring-card ${size}`} />
      <TokenIcon token={pool.tokenY} className={`-ml-1.5 ${size}`} />
    </span>
  );
}

function PoolChips({ pool, now }: { pool: ScreenerPool; now: number }) {
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
      <Badge tone="purple" title="Pool age">
        <ClockIcon className="size-3.5" />
        {age(pool.createdAt, now)}
      </Badge>
    </span>
  );
}

/** Fee/TVL with a bar under it. The square root keeps mid-table pools visible next to one runaway pool. */
function Heat({ value, top, className = "" }: { value: number; top: number; className?: string }) {
  const width = top > 0 ? Math.sqrt(value / top) * 100 : 0;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="num font-semibold">
        <Num value={value} format={percent} />
      </span>
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
      <span className={`num text-[11px] font-medium ${tone}`}>
        <Num value={m} format={times} />
      </span>
    </div>
  );
}

function Money({ usd, solPrice }: { usd: number; solPrice: number | null }) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="num font-medium">
        <Num value={usd} format={compactUsd} />
      </span>
      <span className="num text-[10px] text-muted-foreground">
        <Num value={solPrice ? usd : null} format={(v) => solText(v, solPrice)} />
      </span>
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

function PoolRow({ pool, rank, top, now, solPrice, win, open, onToggle }: RowProps) {
  const flags = warnings(pool);
  return (
    <div className="border-b last:rounded-b-[10px] last:border-b-0">
      <div
        className={`${GRID} group relative isolate h-12 text-xs transition-colors focus-within:bg-muted/50 hover:bg-muted/50 ${open ? "bg-muted/40" : ""}`}
      >
        <RowLink pool={pool} />
        <span className="num text-[11px] text-muted-foreground">{rank}</span>
        <span className="flex min-w-0 items-center gap-2">
          <Pair pool={pool} size="size-5 text-[9px]" />
          <span className="truncate font-semibold group-hover:text-brand">{pool.name}</span>
          <PoolChips pool={pool} now={now} />
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
        <PriceTrend pool={pool} className="hidden xl:flex" />
        <Heat value={pool.feeTvl["24h"]} top={top} className="items-end" />
        <Pace pool={pool} />
        <span className="num text-right">
          <Num value={apr(pool.feeTvl)} format={percent} />
        </span>
        <Money usd={pool.volume[win]} solPrice={solPrice} />
        <Money usd={pool.tvl} solPrice={solPrice} />
        <Flow pool={pool} solPrice={solPrice} className="hidden xl:flex" />
        <span className="num text-right">
          <Num value={turnover(pool)} format={times} />
        </span>
        <Expand open={open} onToggle={onToggle} name={pool.name} />
      </div>
      {open && (
        <Details pool={pool} solPrice={solPrice} className="border-t bg-muted/25 p-3 sm:grid-cols-2 xl:grid-cols-4" />
      )}
    </div>
  );
}

function PoolCard({ pool, rank, top, now, solPrice, win }: Omit<RowProps, "open" | "onToggle">) {
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
              <span className="num shrink-0 text-[11px] text-muted-foreground">#{rank}</span>
            </div>
            <div className="mt-1">
              <PoolChips pool={pool} now={now} />
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
        <CardStat label={`Volume ${win}`}>
          <Money usd={pool.volume[win]} solPrice={solPrice} />
        </CardStat>
        <CardStat label="TVL">
          <Money usd={pool.tvl} solPrice={solPrice} />
        </CardStat>
        <CardStat label="Fee pace">
          <Pace pool={pool} />
        </CardStat>
        <CardStat label="APR">
          <span className="num font-medium">
            <Num value={apr(pool.feeTvl)} format={percent} />
          </span>
        </CardStat>
        <CardStat label="Price 24h">
          <PriceTrend pool={pool} />
        </CardStat>
        <CardStat label="Net flow">
          <Flow pool={pool} solPrice={solPrice} />
        </CardStat>
        <CardStat label="Vol/TVL">
          <span className="num font-medium">
            <Num value={turnover(pool)} format={times} />
          </span>
        </CardStat>
        <CardStat label="Swaps">
          <span className="num font-medium">
            <Num value={pool.stats?.swaps} format={compact} />
          </span>
        </CardStat>
        <CardStat label="Market cap">
          <span className="num font-medium">
            <Num value={baseToken(pool).marketCap} format={compactUsd} />
          </span>
        </CardStat>
      </div>

      {/* Details open in a drawer so the card keeps its height and the grid stays even. */}
      <Drawer>
        <DrawerTrigger asChild>
          <button
            type="button"
            className="relative z-10 -mx-3 mt-auto -mb-3 flex items-center justify-center gap-1 border-t py-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            More details
            <ChevronUpIcon className="size-3.5" />
          </button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[85vh]">
          <div className="flex items-center gap-2 border-b px-4 pt-2 pb-3">
            <Pair pool={pool} size="size-6 text-[10px]" />
            <DrawerTitle className="text-base">{pool.name}</DrawerTitle>
            <PoolChips pool={pool} now={now} />
            <DrawerClose aria-label="Close" className="ml-auto text-muted-foreground">
              <XIcon className="size-5" />
            </DrawerClose>
          </div>
          <Details pool={pool} solPrice={solPrice} className="overflow-y-auto p-3 sm:grid-cols-2" />
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function Expand({ open, onToggle, name }: { open: boolean; onToggle: () => void; name: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} ${name} details`}
      className="relative z-10 flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ChevronRightIcon className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
    </button>
  );
}

/** Ten points of pool price over 24h, scaled to its own range. */
function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * 56},${17 - ((v - min) / span) * 16}`).join(" ");
  return (
    <svg viewBox="0 0 56 18" className="h-4.5 w-14 shrink-0 overflow-visible" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function PriceTrend({ pool, className = "" }: { pool: ScreenerPool; className?: string }) {
  const s = pool.stats;
  if (!s || s.trend.length < 2) return <span className={`text-muted-foreground ${className}`}>{DASH}</span>;
  return (
    <div className={`items-center gap-2 ${className || "flex"} ${toneOf(s.priceChange)}`} title="Pool price over 24h">
      <Sparkline values={s.trend} />
      <span className="num text-[11px] font-medium">
        <Num value={s.priceChange} format={signedPct} />
      </span>
    </div>
  );
}

function Flow({ pool, solPrice, className = "" }: { pool: ScreenerPool; solPrice: number | null; className?: string }) {
  const s = pool.stats;
  if (!s) return <span className={`justify-end text-muted-foreground ${className}`}>{DASH}</span>;
  return (
    <div className={`flex-col items-end leading-tight ${className || "flex"}`}>
      <span className={`num font-medium ${tone(s.netDeposits)}`}>
        <Num value={s.netDeposits} format={signedUsd} />
      </span>
      <span className="num text-[10px] text-muted-foreground">
        <Num value={solPrice ? s.netDeposits : null} format={(v) => signedSol(v, solPrice)} />
      </span>
    </div>
  );
}

function Details({ pool, solPrice, className }: { pool: ScreenerPool; solPrice: number | null; className: string }) {
  const s = pool.stats;
  const base = baseToken(pool);
  const sol = (usd: number) => solText(usd, solPrice);
  const usd = (v: number | null | undefined) => <Num value={v} format={compactUsd} />;
  const n = (v: number | null | undefined) => <Num value={v} format={compact} />;
  const missing = (
    <p className="py-2 text-[11px] text-muted-foreground">Meteora has no figures for this pool right now.</p>
  );
  const inRange = s ? Math.round((s.openPositions * s.inRangePct) / 100) : 0;
  return (
    <div className={`grid gap-2 text-xs ${className}`}>
      <Card Icon={DropletsIcon} title="Liquidity">
        {s ? (
          <>
            <div className="flex items-center gap-3">
              <Ring value={pool.tvl > 0 ? s.activeTvl / pool.tvl : 0} />
              <Tile label="Active TVL" value={usd(s.activeTvl)} sub={`${sol(s.activeTvl)} earning fees`} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Tile label="Fee/active" value={<Num value={s.feeActiveTvl} format={percent} />} />
              <Tile label="In range" value={`${count(inRange)}/${count(s.openPositions)}`} />
              <Tile label="LPs" value={n(s.lps)} />
            </div>
          </>
        ) : (
          missing
        )}
        <Composition pool={pool} />
      </Card>

      <Card Icon={ActivityIcon} title="Trading 24h">
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Fee/TVL 1h" value={<Num value={pool.feeTvl["1h"]} format={percent} />} />
          <Tile label="Swaps" value={n(s?.swaps)} />
          <Tile label="Traders" value={n(s?.traders)} />
          <Tile label="Avg swap" value={usd(s && s.swaps > 0 ? pool.volume["24h"] / s.swaps : null)} />
          <Tile
            label="Volume vs day before"
            value={<Num value={s?.volumeChange} format={signedPct} />}
            className={toneOf(s?.volumeChange ?? null)}
          />
          <Tile label="Volatility" value={<Num value={s?.volatility} format={(v) => v.toFixed(2)} />} />
        </div>
      </Card>

      <Card Icon={ArrowLeftRightIcon} title="Liquidity flow 24h">
        {s ? (
          <>
            <Tile
              label="Net deposits"
              value={<Num value={s.netDeposits} format={signedUsd} />}
              sub={signedSol(s.netDeposits, solPrice)}
              className={`text-base ${tone(s.netDeposits)}`}
            />
            <TugOfWar inflow={s.deposits} outflow={s.withdrawals} />
            <div className="grid grid-cols-2 gap-2">
              <Tile label="Deposited" value={usd(s.deposits)} sub={sol(s.deposits)} />
              <Tile label="Withdrawn" value={usd(s.withdrawals)} sub={sol(s.withdrawals)} className="text-right" />
            </div>
          </>
        ) : (
          missing
        )}
      </Card>

      <Card
        title={
          <span className="flex items-center gap-1.5">
            <TokenIcon token={base} className="size-4 text-[9px]" />
            {base.symbol}
          </span>
        }
        aside={
          <Link
            to="/analytics"
            search={{ pool: pool.address }}
            className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-brand hover:bg-brand/10"
          >
            Analytics
            <ArrowUpRightIcon className="size-3" />
          </Link>
        }
      >
        <div className="grid grid-cols-2 gap-2">
          <Tile label="Market cap" value={usd(base.marketCap)} />
          <Tile label="Holders" value={n(base.holders)} />
        </div>
        <div className="flex items-center gap-3">
          <Ring value={base.organic === null ? null : base.organic / 100} label={base.organic?.toFixed(0)} />
          <Tile label="Organic score" value={organicLabel(base.organic)} sub="How much trading looks like real users" />
        </div>
        <Holders pct={base.topHolders} />
      </Card>
    </div>
  );
}

const organicLabel = (v: number | null) => (v === null ? DASH : v >= 70 ? "High" : v >= 40 ? "Medium" : "Low");

function Card({
  Icon,
  title,
  aside,
  children,
}: {
  Icon?: LucideIcon;
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-[10px] border bg-card p-3">
      <header className="flex h-5 items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
          {Icon && (
            <span className="flex size-5 items-center justify-center rounded-md bg-brand/15 text-brand">
              <Icon className="size-3" />
            </span>
          )}
          {title}
        </h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  className = "",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  className?: string;
}) {
  const end = className.includes("text-right");
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${end ? "items-end" : ""}`}>
      <span className="truncate text-[11px] text-muted-foreground">{label}</span>
      <span className={`num truncate text-[13px] font-semibold ${className}`}>{value}</span>
      {sub && <span className="num truncate text-[10px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

/** A share as a ring, 0 to 1, with the percent (or a given label) in the middle. */
function Ring({ value, label }: { value: number | null; label?: string }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.min(1, Math.max(0, value));
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3.5" className="stroke-muted" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${v * c} ${c}`}
          className="stroke-brand"
        />
      </svg>
      <span className="num text-[10px] font-semibold">
        {value === null ? DASH : (label ?? `${Math.round(v * 100)}%`)}
      </span>
    </span>
  );
}

/** Deposits pull right from the middle and withdrawals pull left, each scaled to the larger of the two. */
function TugOfWar({ inflow, outflow }: { inflow: number; outflow: number }) {
  const total = inflow + outflow;
  if (total <= 0) return null;
  const outPct = (outflow / total) * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex h-2 items-center">
        <span className="flex h-full w-full overflow-hidden rounded-full">
          <span className="h-full bg-loss" style={{ width: `${outPct}%` }} />
          <span className="h-full flex-1 bg-profit" />
        </span>
        <span className="absolute left-1/2 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground" />
      </div>
      <div className="num flex justify-between text-[10px] text-muted-foreground">
        <span>Out {outPct.toFixed(1)}%</span>
        <span>In {(100 - outPct).toFixed(1)}%</span>
      </div>
    </div>
  );
}

/** Top holders' share of supply, with a tick where it starts counting as concentrated. */
function Holders({ pct }: { pct: number | null }) {
  const risky = pct !== null && pct >= CONCENTRATED_PCT;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] text-muted-foreground">Top holders own</span>
        <span className={`num text-[13px] font-semibold ${risky ? "text-orange-600 dark:text-orange-400" : ""}`}>
          {pct === null ? DASH : `${pct.toFixed(1)}%`}
        </span>
      </div>
      <span className="relative h-1.5 w-full rounded-full bg-muted">
        {pct !== null && (
          <span
            className={`absolute inset-y-0 left-0 rounded-full ${risky ? "bg-orange-500" : "bg-brand"}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        )}
        <span
          className="absolute -top-0.5 h-2.5 w-px bg-foreground/50"
          style={{ left: `${CONCENTRATED_PCT}%` }}
          title={`${CONCENTRATED_PCT}% is flagged as concentrated`}
        />
      </span>
    </div>
  );
}

function Composition({ pool }: { pool: ScreenerPool }) {
  if (pool.xShare === null) return null;
  const x = pool.xShare * 100;
  const side = (token: ScreenerPool["tokenX"], share: number, end = false) => (
    <span className={`flex items-center gap-1 ${end ? "flex-row-reverse" : ""}`}>
      <TokenIcon token={token} className="size-3.5 text-[8px]" />
      <span className="font-medium">{token.symbol}</span>
      <span className="num text-muted-foreground">{share.toFixed(0)}%</span>
    </span>
  );
  return (
    <div className="flex flex-col gap-1.5 border-t pt-2.5">
      <div className="flex justify-between text-[11px]">
        {side(pool.tokenX, x)}
        {side(pool.tokenY, 100 - x, true)}
      </div>
      <span className="flex h-1.5 w-full gap-0.5">
        <span className="rounded-full" style={{ width: `${x}%`, background: "var(--brand)" }} />
        <span className="flex-1 rounded-full" style={{ background: "var(--sol)" }} />
      </span>
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
