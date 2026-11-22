import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  CircleCheckIcon,
  CircleXIcon,
  ExternalLinkIcon,
  FilterIcon,
  RefreshCwIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { TokenIcon } from "@/features/portfolio/components/pool-identity";
import { Pagination, PoolFilter } from "@/features/portfolio/components/table-controls";
import { collapseZeros } from "@/features/portfolio/money";
import { pricesQuery } from "@/features/portfolio/portfolio.queries";
import { useStamp } from "@/features/timezone/timezone";
import { useNow } from "@/hooks/use-now";
import { trpc } from "@/trpc/client";
import { age } from "../analytics";
import { trackedBinsQuery, trackedQuery } from "../analytics.queries";
import {
  type PnlFilter,
  positionBars,
  type RangeFilter,
  sumKnown,
  TRACKED_PAGE_SIZES,
  TRACKED_REFRESH_MS,
  type TrackedPageSize,
  type TrackedPosition,
  type TrackedResult,
  type TrackedSort,
  type TrackedWallet,
} from "../tracked";
import { BinChart, MAX_BARS } from "./bin-chart";
import { amount, NA, short, sol, solAmount, solRound, tone, Updated, usd } from "./ui";
import { WalletAvatar } from "./wallet-avatar";

type Token = { symbol: string; icon: string | null; price?: number | null };

export const TRACKED_NOTE = "Deposits are all-time token amounts. Fees and PnL are all-time, from Meteora.";

// Five digits, not formatPrice's three, so the two ends of a narrow range stay distinct.
const price = (v: number | null) =>
  v == null ? NA : collapseZeros(v.toLocaleString("en-US", { maximumSignificantDigits: 5 }));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface Totals {
  positions: number;
  inRange: number;
  known: number;
  liquidityUsd: number | null;
  liquiditySol: number | null;
  feesUsd: number | null;
  pnlUsd: number | null;
  pnlSol: number | null;
}

function totals(positions: readonly TrackedPosition[]): Totals {
  const known = positions.filter((p) => p.inRange != null);
  return {
    positions: positions.length,
    inRange: known.filter((p) => p.inRange).length,
    known: known.length,
    liquidityUsd: sumKnown(positions.map((p) => p.liquidityUsd)),
    liquiditySol: sumKnown(positions.map((p) => p.liquiditySol)),
    feesUsd: sumKnown(positions.map((p) => p.feesUsd)),
    pnlUsd: sumKnown(positions.map((p) => p.pnlUsd)),
    pnlSol: sumKnown(positions.map((p) => p.pnlSol)),
  };
}

/** Labeled tile over a value, matching the portfolio cards. */
function Tile({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 rounded-md border bg-background/90 p-3 text-center text-xs ${className}`}
    >
      <span className="text-[0.6875rem] font-medium tracking-[0.025em] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Big({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`text-lg leading-tight font-bold tabular-nums ${className}`}>{children}</div>;
}

/** Share of in-range positions as a ring, the same shape the portfolio stat cards use. */
function Ring({ share }: { share: number }) {
  const c = 2 * Math.PI * 14;
  return (
    <svg viewBox="0 0 40 40" className="size-8 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="20" cy="20" r="14" className="fill-none stroke-loss" strokeWidth="5" />
      <circle
        cx="20"
        cy="20"
        r="14"
        className="fill-none stroke-profit"
        strokeWidth="5"
        strokeDasharray={`${share * c} ${c}`}
      />
    </svg>
  );
}

/** `In Range`, `Out of Range` or `2/3 In Range`, colored like the portfolio's range pill. */
function RangePill({ inRange, known, total }: { inRange: number; known: number; total: number }) {
  if (known === 0) return null;
  const outside = known - inRange;
  const [text, className, Icon] =
    outside === 0 && known === total
      ? ["In Range", "bg-profit/15 text-profit", CircleCheckIcon]
      : inRange === 0
        ? ["Out of Range", "bg-loss/15 text-loss", CircleXIcon]
        : [`${inRange}/${total} In Range`, "bg-brand/15 text-brand", CircleCheckIcon];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
    >
      <Icon className="size-3" />
      {text}
    </span>
  );
}

/**
 * Every tile covers the whole pool. Fees and PnL fill in as the server's background job reaches each wallet, so they
 * say how far it has got, and how many wallets are missing when some failed.
 */
function PoolTotals({ data }: { data: Extract<TrackedResult, { ok: true }> }) {
  const t = data.totals;
  const share = data.rangeKnownPositions > 0 ? data.inRangePositions / data.rangeKnownPositions : null;
  const missing = t.total - t.loaded + t.failed;
  const note = t.running ? (
    <span className="text-muted-foreground">
      {t.loaded} of {plural(t.total, "wallet")}
    </span>
  ) : missing > 0 ? (
    <span className="text-muted-foreground">{plural(missing, "wallet")} missing</span>
  ) : null;
  return (
    <div className="grid grid-cols-2 gap-1.5 pb-1 @xl:grid-cols-4">
      <Tile label="Wallets">
        <Big>{data.totalWallets}</Big>
        <span className="text-muted-foreground">{plural(data.totalPositions, "position")}</span>
      </Tile>
      <Tile label="In range">
        <div className="flex items-center gap-2">
          {share != null && <Ring share={share} />}
          <Big>{share == null ? NA : `${Math.round(share * 100)}%`}</Big>
        </div>
      </Tile>
      <Tile label="Fees">
        <Big>{usd(t.feesUsd)}</Big>
        <span className="text-muted-foreground tabular-nums">{solAmount(t.feesSol)}</span>
        {note}
      </Tile>
      <Tile label="Unrealized PnL">
        <Big className={tone(t.pnlUsd)}>{usd(t.pnlUsd, true)}</Big>
        <span className={`tabular-nums ${tone(solRound(t.pnlSol))}`}>{sol(t.pnlSol)}</span>
        {note}
      </Tile>
    </div>
  );
}

/** A label above the value below the wide layout; the column header names it there instead. */
function Cell({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
      <span className="text-[0.6875rem] text-muted-foreground @2xl:hidden">{label}</span>
      {children}
    </div>
  );
}

// One grid for the header and every row, so the columns line up at the wide layout.
const ROW_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-2 @md:grid-cols-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] @2xl:items-center @2xl:gap-y-0";

function PositionHeader() {
  return (
    <div
      className={`${ROW_GRID} hidden pb-1 text-[0.6875rem] font-medium tracking-[0.025em] text-muted-foreground @2xl:grid`}
    >
      <span>Position</span>
      <span>Range</span>
      <span>Deposits</span>
      <span className="text-right">Liquidity</span>
      <span className="text-right">Fees</span>
      <span className="text-right">Unclaimed</span>
      <span className="text-right">PnL</span>
      <span className="text-right">Created</span>
    </div>
  );
}

function TokenAmount({ value, token }: { value: number | null; token: Token }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <TokenIcon token={token} className="size-3.5 text-[8px]" />
      <span className="truncate">
        {amount(value)} <span className="text-muted-foreground">{token.symbol}</span>
      </span>
    </span>
  );
}

/**
 * What one position holds in each bin, read on chain when the row is opened, drawn like the pool's Liquidity
 * Distribution. A position is at most 70 bins wide, so every bin keeps its own bar.
 */
function PositionDistribution({
  pool,
  p,
  base,
  quote,
}: {
  pool: string;
  p: TrackedPosition;
  base: Token;
  quote: Token;
}) {
  const { data, isPending } = useQuery(trackedBinsQuery(pool, p.address));
  const solUsd = useQuery(pricesQuery).data?.sol ?? null;
  if (isPending) return <div className="h-40 animate-pulse rounded-md bg-background/60" />;
  if (!data?.ok) return <p className="text-xs text-loss">{data?.message ?? "The bins could not be read."}</p>;
  const xUsd = base.price ?? null;
  const yUsd = quote.price ?? null;
  if (xUsd == null || yUsd == null || data.bins.length === 0) {
    return <p className="text-xs text-muted-foreground">{NA}</p>;
  }
  const bars = positionBars(data.bins, data.activeBinId, MAX_BARS).map((b) => ({
    id: b.id,
    lastId: b.lastId,
    price: b.price,
    lastPrice: b.lastPrice,
    xUsd: b.x * xUsd,
    yUsd: b.y * yUsd,
    height: (b.x * xUsd + b.y * yUsd) / b.count,
    active: b.side === "active",
  }));
  const poolPrice = data.bins.find((b) => b.id === data.activeBinId)?.price ?? null;
  const side = data.activeBinId < (bars[0]?.id ?? 0) ? "below" : "above";
  const outside = bars.every((b) => !b.active);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-full bg-brand" />
          {base.symbol}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-full" style={{ background: "var(--sol)" }} />
          {quote.symbol}
        </span>
        {outside && (
          <span className="ml-auto">
            Pool price is {side} this range{p.activeBinId == null ? "" : ` (bin ${p.activeBinId})`}
          </span>
        )}
      </div>
      <BinChart bars={bars} x={base.symbol} y={quote.symbol} poolPrice={poolPrice ?? 0} solUsd={solUsd} />
    </div>
  );
}

function PositionRow({
  pool,
  visible,
  p,
  scannedAt,
  base,
  quote,
}: {
  pool: string;
  /** Whether the wallet card is open; the chart reads the chain only then. */
  visible: boolean;
  p: TrackedPosition;
  scannedAt: number;
  base: Token;
  quote: Token;
}) {
  const stamp = useStamp();
  return (
    <li className={`${ROW_GRID} py-2.5 tabular-nums`}>
      <div className="col-span-full flex min-w-0 items-center justify-between gap-2 @2xl:col-span-1 @2xl:flex-col @2xl:items-start @2xl:gap-1">
        <a
          href={`https://solscan.io/account/${p.address}`}
          target="_blank"
          rel="noreferrer"
          title={p.address}
          className="inline-flex min-w-0 items-center gap-1 font-mono text-xs font-semibold hover:text-brand"
        >
          <span className="truncate">{short(p.address)}</span>
          <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" />
        </a>
        {p.inRange != null && <RangePill inRange={p.inRange ? 1 : 0} known={1} total={1} />}
      </div>
      <Cell label="Range" className="col-span-full @2xl:col-span-1">
        <span className="truncate font-semibold">
          {price(p.minPrice)} – {price(p.maxPrice)}
        </span>
      </Cell>
      <Cell label="Deposits">
        <TokenAmount value={p.depositX} token={base} />
        <TokenAmount value={p.depositY} token={quote} />
      </Cell>
      <Cell label="Liquidity" className="@2xl:items-end">
        <span className="font-semibold">{usd(p.liquidityUsd)}</span>
        <span className="text-muted-foreground">{solAmount(p.liquiditySol)}</span>
      </Cell>
      <Cell label="Fees" className="@2xl:items-end">
        <span className="font-semibold">{usd(p.feesUsd)}</span>
        <span className="text-muted-foreground">{solAmount(p.feesSol)}</span>
      </Cell>
      <Cell label="Unclaimed" className="@2xl:items-end">
        <span className="font-semibold">{usd(p.unclaimedUsd)}</span>
        <span className="text-muted-foreground">{solAmount(p.unclaimedSol)}</span>
      </Cell>
      <Cell label="PnL" className="@2xl:items-end">
        <span className={`font-semibold ${tone(p.pnlUsd)}`}>{usd(p.pnlUsd, true)}</span>
        <span className={tone(solRound(p.pnlSol))}>{sol(p.pnlSol)}</span>
      </Cell>
      <Cell label="Created" className="@2xl:items-end">
        {p.createdAt == null ? (
          <span className="text-muted-foreground">{NA}</span>
        ) : (
          <span className="font-semibold" title={stamp(p.createdAt)}>
            {age(p.createdAt, scannedAt)} ago
          </span>
        )}
      </Cell>
      {visible && (
        <div className="col-span-full rounded-md bg-background/60 p-2.5">
          <PositionDistribution pool={pool} p={p} base={base} quote={quote} />
        </div>
      )}
    </li>
  );
}

/** A labeled USD-over-SOL column on the wallet card, fixed width so the columns line up from card to card. */
function SummaryStat({
  label,
  usd,
  sol,
  usdClassName = "",
  solClassName = "text-muted-foreground",
}: {
  label: string;
  usd: string;
  sol: string;
  usdClassName?: string;
  solClassName?: string;
}) {
  return (
    <span className="flex w-20 shrink-0 flex-col items-end gap-0.5 tabular-nums @md:w-24">
      <span className="text-[0.6875rem] text-muted-foreground">{label}</span>
      <span className={`text-sm leading-tight font-bold ${usdClassName}`}>{usd}</span>
      <span className={`whitespace-nowrap ${solClassName}`}>{sol}</span>
    </span>
  );
}

function WalletCard({
  pool,
  wallet,
  scannedAt,
  base,
  quote,
}: {
  pool: string;
  wallet: TrackedWallet;
  scannedAt: number;
  base: Token;
  quote: Token;
}) {
  const t = totals(wallet.positions);
  const [open, setOpen] = useState(false);
  return (
    <details className="group text-xs" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-md px-1 py-2.5 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
        <WalletAvatar address={wallet.owner} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-xs font-semibold" title={wallet.owner}>
              {short(wallet.owner)}
            </span>
            <a
              href={`https://solscan.io/account/${wallet.owner}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`${short(wallet.owner)} on Solscan`}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 text-muted-foreground hover:text-brand"
            >
              <ExternalLinkIcon className="size-3" />
            </a>
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            {plural(t.positions, "position")}
            <RangePill inRange={t.inRange} known={t.known} total={t.positions} />
          </span>
        </span>
        <SummaryStat label="Liquidity" usd={usd(t.liquidityUsd)} sol={solAmount(t.liquiditySol)} />
        <SummaryStat
          label="PnL"
          usd={usd(t.pnlUsd, true)}
          sol={sol(t.pnlSol)}
          usdClassName={tone(t.pnlUsd)}
          solClassName={tone(solRound(t.pnlSol))}
        />
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mb-2.5 rounded-lg bg-muted/50 px-3 pt-2 pb-0.5">
        <PositionHeader />
        <ul className="flex flex-col divide-y divide-border/60">
          {wallet.positions.map((p) => (
            <PositionRow
              key={p.address}
              pool={pool}
              visible={open}
              p={p}
              scannedAt={scannedAt}
              base={base}
              quote={quote}
            />
          ))}
        </ul>
      </div>
    </details>
  );
}

const RANGE_OPTIONS: { value: RangeFilter; label: string }[] = [
  { value: "in", label: "In range" },
  { value: "out", label: "Out of range" },
];
const PNL_OPTIONS: { value: PnlFilter; label: string }[] = [
  { value: "profit", label: "Profit" },
  { value: "loss", label: "Loss" },
];

function CheckGroup<T extends string>({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: { value: T; label: string }[];
  selected: ReadonlySet<T>;
  onChange: (next: ReadonlySet<T>) => void;
}) {
  return (
    <div>
      <div className="px-0.75 pt-1 pb-0.5 text-[0.6875rem] text-muted-foreground">{title}</div>
      <ul>
        {options.map((o) => (
          <li key={o.value}>
            <label
              htmlFor={`tracked-${o.value}`}
              className="flex cursor-pointer items-center gap-1.5 rounded px-0.75 py-1.25 text-xs hover:bg-muted"
            >
              <Checkbox
                id={`tracked-${o.value}`}
                checked={selected.has(o.value)}
                onCheckedChange={(on) => {
                  const next = new Set(selected);
                  if (on) next.add(o.value);
                  else next.delete(o.value);
                  onChange(next);
                }}
              />
              {o.label}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SORT_OPTIONS: { value: TrackedSort; label: string }[] = [
  { value: "recent", label: "Newest activity" },
  { value: "liquidity", label: "Most liquidity" },
];

/** The portfolio's pair filter: an icon that turns brand while a filter or sort is on, opening a checkbox list. */
function WalletFilterMenu({
  range,
  pnl,
  sort,
  onRange,
  onPnl,
  onSort,
}: {
  range: ReadonlySet<RangeFilter>;
  pnl: ReadonlySet<PnlFilter>;
  sort: TrackedSort;
  onRange: (next: ReadonlySet<RangeFilter>) => void;
  onPnl: (next: ReadonlySet<PnlFilter>) => void;
  onSort: (next: TrackedSort) => void;
}) {
  const active = range.size + pnl.size > 0 || sort !== "recent";
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Filter wallets"
        className={`relative p-1.25 hover:text-foreground ${active ? "text-brand" : "text-foreground/80"}`}
      >
        <FilterIcon className="size-3.25" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-51.25 p-1.5">
        <div className="flex items-center justify-between px-0.75 pb-0.5 text-xs font-semibold">
          Filters
          {active && (
            <button
              type="button"
              className="text-[0.625rem] font-normal text-brand"
              onClick={() => {
                onRange(new Set());
                onPnl(new Set());
                onSort("recent");
              }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="px-0.75 pt-1 pb-0.5 text-[0.6875rem] text-muted-foreground">Sort by</div>
        <RadioGroup value={sort} onValueChange={(v) => onSort(v as TrackedSort)} className="gap-0">
          {SORT_OPTIONS.map((o) => (
            <label
              key={o.value}
              htmlFor={`tracked-sort-${o.value}`}
              className="flex cursor-pointer items-center gap-1.5 rounded px-0.75 py-1.25 text-xs hover:bg-muted"
            >
              <RadioGroupItem id={`tracked-sort-${o.value}`} value={o.value} />
              {o.label}
            </label>
          ))}
        </RadioGroup>
        <CheckGroup title="Range" options={RANGE_OPTIONS} selected={range} onChange={onRange} />
        <CheckGroup title="PnL" options={PNL_OPTIONS} selected={pnl} onChange={onPnl} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * Asks the server for a new scan of the pool and new figures for this page. Off for a minute after a scan and while
 * the totals are loading, which is when the server would ignore it.
 */
function RefreshButton({
  pool,
  page,
  pageSize,
  filter,
  data,
}: {
  pool: string;
  page: number;
  pageSize: TrackedPageSize;
  filter: { query: string; range: RangeFilter[]; pnl: PnlFilter[]; sort: TrackedSort };
  data: Extract<TrackedResult, { ok: true }>;
}) {
  const queryClient = useQueryClient();
  const now = useNow(data.scannedAt);
  const refresh = useMutation({
    mutationFn: () => trpc.analytics.tracked.query({ pool, page, pageSize, ...filter, refresh: true }),
    onSuccess: async (next) => {
      // The other pages come from the old scan; they refetch when opened.
      await queryClient.invalidateQueries({ queryKey: ["analytics", "tracked", pool], refetchType: "none" });
      queryClient.setQueryData(trackedQuery({ pool, page, pageSize, ...filter }).queryKey, next);
    },
  });
  const why = refresh.isPending
    ? "Refreshing"
    : data.totals.running
      ? "Fees and PnL are still loading"
      : now - data.scannedAt < TRACKED_REFRESH_MS
        ? "Refreshed less than a minute ago"
        : null;
  return (
    <button
      type="button"
      aria-label="Refresh tracked wallets"
      title={why ?? "Refresh"}
      disabled={why != null}
      onClick={() => refresh.mutate()}
      className="p-1.25 text-foreground/80 hover:text-foreground disabled:text-muted-foreground/50"
    >
      <RefreshCwIcon className={`size-3.25 ${refresh.isPending ? "animate-spin" : ""}`} />
    </button>
  );
}

export function TrackedBody({ pool, base, quote }: { pool: string; base: Token; quote: Token }) {
  // Paging state belongs to one pool, so switching pools starts again on the first page.
  const [paging, setPaging] = useState<{ pool: string; page: number; size: TrackedPageSize }>({
    pool,
    page: 1,
    size: TRACKED_PAGE_SIZES[0],
  });
  if (paging.pool !== pool) setPaging({ pool, page: 1, size: paging.size });
  const page = paging.pool === pool ? paging.page : 1;
  // The previous page stays on screen while the next one loads.
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<ReadonlySet<RangeFilter>>(new Set());
  const [pnl, setPnl] = useState<ReadonlySet<PnlFilter>>(new Set());
  // The server filters the whole pool before paging; typing waits a moment so each keystroke is not a request.
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(query), 300);
    return () => clearTimeout(t);
  }, [query]);
  const [sort, setSort] = useState<TrackedSort>("recent");
  const filter = { query: search, range: [...range], pnl: [...pnl], sort };
  const { data } = useQuery({
    ...trackedQuery({ pool, page, pageSize: paging.size, ...filter }),
    placeholderData: keepPreviousData,
  });
  const ok = data?.ok === true;
  const wallets = ok ? data.wallets : [];
  // A new search or filter starts from the first page.
  const firstPage = () => setPaging((p) => ({ ...p, page: 1 }));
  const pages = ok ? data.pages : 1;
  const filtered = search.trim() !== "" || range.size > 0 || pnl.size > 0;

  return (
    <>
      {!data && <div className="h-24 animate-pulse rounded-lg bg-background/60" />}
      {data && !data.ok && <p className="text-xs text-loss">{data.message}</p>}
      {ok && data.totalWallets === 0 && <p className="text-xs text-muted-foreground">No open positions.</p>}
      {ok && data.totalWallets > 0 && (
        <>
          <PoolTotals data={data} />
          <div className="flex items-center justify-between gap-2.5 pt-1">
            <PoolFilter
              value={query}
              placeholder="Search wallet or position"
              onChange={(q) => {
                setQuery(q);
                firstPage();
              }}
            />
            <div className="flex items-center gap-1">
              <Updated at={data.scannedAt} />
              <RefreshButton pool={pool} page={page} pageSize={paging.size} filter={filter} data={data} />
              <WalletFilterMenu
                range={range}
                pnl={pnl}
                sort={sort}
                onRange={(next) => {
                  setRange(next);
                  firstPage();
                }}
                onPnl={(next) => {
                  setPnl(next);
                  firstPage();
                }}
                onSort={(next) => {
                  setSort(next);
                  firstPage();
                }}
              />
            </div>
          </div>
          {filtered && (
            <p className="text-xs text-muted-foreground">
              {plural(data.matchedWallets, "wallet")} match
              {data.totals.running && pnl.size > 0 ? " so far; PnL is still loading" : ""}
            </p>
          )}
          {sort === "liquidity" && data.totals.running && (
            <p className="text-xs text-muted-foreground">
              Sorted by liquidity so far: {data.totals.loaded} of {plural(data.totals.total, "wallet")} loaded
            </p>
          )}
          {wallets.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No wallets match.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {wallets.map((w) => (
                <WalletCard key={w.owner} pool={pool} wallet={w} scannedAt={data.scannedAt} base={base} quote={quote} />
              ))}
            </div>
          )}
          {data.unmatched > 0 && (
            <p className="text-xs text-muted-foreground">
              {plural(data.unmatched, "position")} had no detail from Meteora, so their figures show a dash.
            </p>
          )}
          {pages > 1 && (
            // The portfolio's pagination bar, flattened onto the panel's bottom edge instead of sticking.
            <div className="-mx-3 -mb-3 [&>div]:static [&>div]:rounded-b-[10px] [&>div]:bg-card">
              <Pagination
                total={data.matchedWallets}
                page={page - 1}
                pages={pages}
                pageSize={paging.size}
                sizes={TRACKED_PAGE_SIZES}
                onPage={(p) => setPaging((prev) => ({ ...prev, pool, page: p + 1 }))}
                onPageSize={(size) => setPaging({ pool, page: 1, size: size as TrackedPageSize })}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
