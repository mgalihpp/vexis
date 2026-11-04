import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, CircleCheckIcon, CircleXIcon, ExternalLinkIcon, FilterIcon, InfoIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TokenIcon } from "@/features/portfolio/components/pool-identity";
import { Pagination, PoolFilter } from "@/features/portfolio/components/table-controls";
import { useStamp } from "@/features/timezone/timezone";
import { age } from "../analytics";
import { trackedQuery } from "../analytics.queries";
import {
  filterWallets,
  type PnlFilter,
  type RangeFilter,
  rangeBar,
  sumKnown,
  TRACKED_PAGE_SIZES,
  type TrackedPageSize,
  type TrackedPosition,
  type TrackedResult,
  type TrackedWallet,
} from "../tracked";
import { compact, NA, Panel } from "./ui";
import { WalletAvatar } from "./wallet-avatar";

type Token = { symbol: string; icon: string | null };

const NOTE = "Deposits are all-time token amounts. Fees and PnL are all-time, from Meteora.";

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;
const amount = (v: number | null) => (v == null ? NA : v.toLocaleString("en-US", { maximumSignificantDigits: 4 }));
const price = (v: number | null) => (v == null ? NA : v.toLocaleString("en-US", { maximumSignificantDigits: 5 }));
const usd = (v: number | null, signed = false) =>
  v == null ? NA : `${v < 0 ? "-" : signed && v > 0 ? "+" : ""}$${compact(Math.abs(v))}`;
const sol3 = (v: number | null) => (v == null ? null : Math.round(v * 1000) / 1000);
const sol = (v: number | null) => {
  if (v == null) return NA;
  // Sign from the rounded value, so a dust amount reads `0 SOL` instead of `+0 SOL`.
  const r = Math.round(v * 1000) / 1000;
  return `${r < 0 ? "-" : r > 0 ? "+" : ""}${Math.abs(r).toLocaleString("en-US", { maximumFractionDigits: 3 })} SOL`;
};
const tone = (v: number | null) => (v == null || v === 0 ? "" : v > 0 ? "text-profit" : "text-loss");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

interface Totals {
  positions: number;
  inRange: number;
  known: number;
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
    feesUsd: sumKnown(positions.map((p) => p.feesUsd)),
    pnlUsd: sumKnown(positions.map((p) => p.pnlUsd)),
    pnlSol: sumKnown(positions.map((p) => p.pnlSol)),
  };
}

/** Uppercase label over a value, the tile the portfolio cards use. */
function Tile({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-1 rounded-md border bg-background/90 p-3 text-center text-xs ${className}`}
    >
      <span className="text-[0.6875rem] font-medium tracking-[0.025em] text-muted-foreground uppercase">{label}</span>
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
        {note}
      </Tile>
      <Tile label="Unrealized PnL">
        <Big className={tone(t.pnlUsd)}>{usd(t.pnlUsd, true)}</Big>
        <span className={`tabular-nums ${tone(sol3(t.pnlSol))}`}>{sol(t.pnlSol)}</span>
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
  "grid grid-cols-2 gap-x-3 gap-y-2 @md:grid-cols-4 @2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,0.9fr)_minmax(0,0.9fr)] @2xl:items-center @2xl:gap-y-0";

function PositionHeader() {
  return (
    <div
      className={`${ROW_GRID} hidden pb-1 text-[0.6875rem] font-medium tracking-[0.025em] text-muted-foreground uppercase @2xl:grid`}
    >
      <span>Position</span>
      <span>Range</span>
      <span>Deposits</span>
      <span className="text-right">Fees</span>
      <span className="text-right">PnL</span>
      <span className="text-right">Created</span>
    </div>
  );
}

const MAX_BIN_BLOCKS = 120;

// The portfolio's distribution colors: token Y below the price, token X above, the active bin blending both.
const BIN_COLOR = {
  below: "bg-foreground/70",
  active: "bg-linear-to-r from-foreground/70 to-brand",
  above: "bg-brand",
};

/**
 * The position's bins colored like the portfolio's active-position distribution, on a track wide enough to show the
 * price tick when it sits outside the range.
 */
function RangeVisual({ p }: { p: TrackedPosition }) {
  const { lowerBinId: lower, upperBinId: upper, activeBinId: active } = p;
  if (lower == null || upper == null || active == null) return null;
  const bar = rangeBar(lower, upper, active);
  const where = bar.side === "inside" ? "inside the range" : `${plural(bar.outside, "bin")} ${bar.side} the range`;
  const label = `Bins ${lower} to ${upper}. Active bin ${active} is ${where}.`;
  const count = upper - lower + 1;
  const side = (b: number): keyof typeof BIN_COLOR => (b < active ? "below" : b > active ? "above" : "active");
  // One block per bin, or for a very wide position three blocks sized by their bin counts.
  const segments =
    count <= MAX_BIN_BLOCKS
      ? Array.from({ length: count }, (_, i) => ({ key: lower + i, side: side(lower + i), grow: 1 }))
      : [
          { key: 0, side: "below" as const, grow: Math.max(0, Math.min(active, upper + 1) - lower) },
          { key: 1, side: "active" as const, grow: active >= lower && active <= upper ? 1 : 0 },
          { key: 2, side: "above" as const, grow: Math.max(0, upper - Math.max(active, lower - 1)) },
        ].filter((s) => s.grow > 0);
  return (
    <div role="img" aria-label={label} title={label} className="relative my-1.5 h-3 w-full">
      <div
        className={`absolute inset-y-0 flex ${count <= 60 ? "gap-px" : ""}`}
        style={{ left: `${bar.start * 100}%`, width: `${(bar.end - bar.start) * 100}%` }}
      >
        {segments.map((s) => (
          <div
            key={s.key}
            className={`h-full rounded-[0.05rem] ${BIN_COLOR[s.side]}`}
            style={{ flexGrow: s.grow, flexBasis: 0 }}
          />
        ))}
      </div>
      <div className="absolute -top-1 bottom-0 w-px bg-foreground" style={{ left: `${bar.active * 100}%` }} />
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

function PositionRow({
  p,
  scannedAt,
  base,
  quote,
}: {
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
        {/* Price and bar share a line until the table layout, where the column is too narrow for both. */}
        <div className="flex flex-col @md:flex-row @md:items-center @md:gap-4 @2xl:flex-col @2xl:items-stretch @2xl:gap-0">
          <span className="font-semibold whitespace-nowrap">
            {price(p.minPrice)} – {price(p.maxPrice)}
          </span>
          <div className="min-w-0 flex-1">
            <RangeVisual p={p} />
          </div>
        </div>
      </Cell>
      <Cell label="Deposits">
        <TokenAmount value={p.depositX} token={base} />
        <TokenAmount value={p.depositY} token={quote} />
      </Cell>
      <Cell label="Fees" className="@2xl:items-end">
        <span className="font-semibold">{usd(p.feesUsd)}</span>
      </Cell>
      <Cell label="PnL" className="@2xl:items-end">
        <span className={`font-semibold ${tone(p.pnlUsd)}`}>{usd(p.pnlUsd, true)}</span>
        <span className={tone(sol3(p.pnlSol))}>{sol(p.pnlSol)}</span>
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
    </li>
  );
}

function WalletCard({
  wallet,
  scannedAt,
  base,
  quote,
}: {
  wallet: TrackedWallet;
  scannedAt: number;
  base: Token;
  quote: Token;
}) {
  const t = totals(wallet.positions);
  return (
    <details className="group text-xs">
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
        <span className="flex flex-col items-end gap-0.5 tabular-nums">
          <span className={`text-sm font-bold ${tone(t.pnlUsd)}`}>{usd(t.pnlUsd, true)}</span>
          <span className={tone(sol3(t.pnlSol))}>{sol(t.pnlSol)}</span>
        </span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="mb-2.5 rounded-lg bg-muted/50 px-3 pt-2 pb-0.5">
        <PositionHeader />
        <ul className="flex flex-col divide-y divide-border/60">
          {wallet.positions.map((p) => (
            <PositionRow key={p.address} p={p} scannedAt={scannedAt} base={base} quote={quote} />
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

/** The portfolio's pair filter: an icon that turns brand while a filter is on, opening a checkbox list. */
function WalletFilterMenu({
  range,
  pnl,
  onRange,
  onPnl,
}: {
  range: ReadonlySet<RangeFilter>;
  pnl: ReadonlySet<PnlFilter>;
  onRange: (next: ReadonlySet<RangeFilter>) => void;
  onPnl: (next: ReadonlySet<PnlFilter>) => void;
}) {
  const active = range.size + pnl.size > 0;
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
              }}
            >
              Clear
            </button>
          )}
        </div>
        <CheckGroup title="Range" options={RANGE_OPTIONS} selected={range} onChange={onRange} />
        <CheckGroup title="PnL" options={PNL_OPTIONS} selected={pnl} onChange={onPnl} />
      </PopoverContent>
    </Popover>
  );
}

export function TrackedWallets({ pool, base, quote }: { pool: string; base: Token; quote: Token }) {
  // Paging state belongs to one pool, so switching pools starts again on the first page.
  const [paging, setPaging] = useState<{ pool: string; page: number; size: TrackedPageSize }>({
    pool,
    page: 1,
    size: TRACKED_PAGE_SIZES[0],
  });
  if (paging.pool !== pool) setPaging({ pool, page: 1, size: paging.size });
  const page = paging.pool === pool ? paging.page : 1;
  // The previous page stays on screen while the next one loads.
  const { data } = useQuery({
    ...trackedQuery({ pool, page, pageSize: paging.size }),
    placeholderData: keepPreviousData,
  });
  const ok = data?.ok === true;
  const wallets = ok ? data.wallets : [];
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<ReadonlySet<RangeFilter>>(new Set());
  const [pnl, setPnl] = useState<ReadonlySet<PnlFilter>>(new Set());
  // Filters apply to the wallets on the current page; a new search or filter starts from the first page.
  const firstPage = () => setPaging((p) => ({ ...p, page: 1 }));
  const matched = useMemo(() => filterWallets(wallets, { query, range, pnl }), [wallets, query, range, pnl]);
  const pages = ok ? data.pages : 1;

  return (
    <Panel
      className="@container"
      title={
        <span className="flex items-center gap-1.5">
          Tracked wallets
          <InfoTip aria-label={NOTE} content={NOTE} contentClassName="max-w-56">
            <InfoIcon className="size-3.5 text-muted-foreground" />
          </InfoTip>
        </span>
      }
    >
      {!data && <div className="h-24 animate-pulse rounded-lg bg-background/60" />}
      {data && !data.ok && <p className="text-xs text-loss">{data.message}</p>}
      {ok && wallets.length === 0 && <p className="text-xs text-muted-foreground">No open positions.</p>}
      {ok && wallets.length > 0 && (
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
            <WalletFilterMenu
              range={range}
              pnl={pnl}
              onRange={(next) => {
                setRange(next);
                firstPage();
              }}
              onPnl={(next) => {
                setPnl(next);
                firstPage();
              }}
            />
          </div>
          {matched.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No wallets match.</p>
          ) : (
            <div className="flex flex-col divide-y">
              {matched.map((w) => (
                <WalletCard key={w.owner} wallet={w} scannedAt={data.scannedAt} base={base} quote={quote} />
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
                total={data.totalWallets}
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
    </Panel>
  );
}
