import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BadgeCheckIcon, ExternalLinkIcon, MoreHorizontalIcon, SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination } from "@/features/portfolio/components/table-controls";
import { compactUsd, timeAgo } from "@/features/portfolio/money";
import { pricesQuery } from "@/features/portfolio/portfolio.queries";
import { apr, type ScreenerPool, warnings } from "@/features/screener/screener";
import { screenerQuery } from "@/features/screener/screener.queries";
import { shortAddr } from "@/lib/format";
import type { PairTokens } from "../agents";
import { alertsQuery } from "../agents.queries";
import { PairLogo } from "./agent-layout";

export interface PoolRow {
  address: string;
  label: string | null;
  tokens: PairTokens;
  /** The agent's own record of its last alert on this pool, when it has one. */
  lastAlertAt: number | null;
  /** Set when the user may stop watching the pool. */
  onRemove?: () => void;
  removing?: boolean;
}

const DAY = 86_400_000;
const PAGE_SIZES = [10, 20, 50];
const TABS = [
  { id: "all", label: "All pools" },
  { id: "alerted", label: "Alerted 24h" },
  { id: "quiet", label: "Quiet" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const solFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

/** USD with SOL under it at the footer's SOL price; a dash when that price is missing. */
function Amount({ usd, solPrice }: { usd: number; solPrice: number | null }) {
  return (
    <>
      <div>{compactUsd(usd)}</div>
      <div className="text-[0.625rem] text-muted-foreground">
        {solPrice ? `${solFmt.format(usd / solPrice)} SOL` : "—"}
      </div>
    </>
  );
}

const percent = (n: number) => `${n.toFixed(n < 10 ? 2 : 1)}%`;

/**
 * The pools an agent watches, each joined by address with the screener list the screener page already polls, so
 * TVL, volume, fees and APR cost no extra datapi request. A pool below the screener's floor shows dashes.
 */
export function PoolsTable({
  rows,
  agentId,
  now,
  empty,
  lastLabel = "Last alert",
}: {
  rows: PoolRow[];
  lastLabel?: string;
  /** Reads this agent's alerts for pools that have no `lastAlertAt` of their own (screener matches). */
  agentId?: string;
  now: number;
  empty: string;
}) {
  const { data: screener } = useQuery(screenerQuery);
  const { data: prices } = useQuery(pricesQuery);
  const { data: alerts } = useQuery({ ...alertsQuery, enabled: agentId !== undefined });
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0] ?? 10);

  const byAddress = new Map(screener?.pools.map((p) => [p.address, p]));
  const lastAlert = new Map<string, number>();
  for (const a of alerts?.alerts ?? []) {
    if (a.agentId === agentId && a.at > (lastAlert.get(a.poolAddress) ?? 0)) lastAlert.set(a.poolAddress, a.at);
  }
  const full = rows.map((r) => {
    const pool = byAddress.get(r.address);
    const at = Math.max(r.lastAlertAt ?? 0, lastAlert.get(r.address) ?? 0) || null;
    return { ...r, pool, at, name: r.label ?? pool?.name ?? shortAddr(r.address) };
  });
  const alerted = (r: (typeof full)[number]) => r.at !== null && now - r.at < DAY;
  const count = {
    all: full.length,
    alerted: full.filter(alerted).length,
    quiet: full.filter((r) => !alerted(r)).length,
  };
  const q = query.trim().toLowerCase();
  const shown = full.filter(
    (r) =>
      (tab === "all" || (tab === "alerted") === alerted(r)) &&
      (!q || r.name.toLowerCase().includes(q) || r.address.toLowerCase().includes(q)),
  );
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pages - 1);
  const pageRows = shown.slice(current * pageSize, (current + 1) * pageSize);
  const maxVolume = Math.max(1, ...full.map((r) => r.pool?.volume["24h"] ?? 0));
  const solPrice = prices?.sol ?? null;
  const pick = (next: () => void) => {
    next();
    setPage(0);
  };

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4">
        <div role="tablist" className="-mb-px flex gap-5 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => pick(() => setTab(t.id))}
              className={`flex shrink-0 items-center gap-2 border-b-2 py-3.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "border-brand text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              <span
                className={`rounded px-1.5 py-0.5 text-[0.65rem] tabular-nums ${
                  tab === t.id ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"
                }`}
              >
                {count[t.id]}
              </span>
            </button>
          ))}
        </div>
        <label className="relative mb-3 w-full sm:my-2.5 sm:w-60">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => pick(() => setQuery(e.target.value))}
            placeholder="Search pools..."
            aria-label="Search pools"
            className="h-9 w-full rounded-lg border bg-background/40 pr-3 pl-9 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring"
          />
        </label>
      </div>

      <Table className="min-w-[60rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-11 pl-4">Pool</TableHead>
            <TableHead className="text-right">TVL</TableHead>
            <TableHead className="pl-8">Volume 24h</TableHead>
            <TableHead className="text-right">Fees 24h</TableHead>
            <TableHead className="text-right">APR</TableHead>
            <TableHead>{lastLabel}</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="pr-4 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {pageRows.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                {full.length === 0 ? empty : "No pools match these filters."}
              </TableCell>
            </TableRow>
          )}
          {pageRows.map((r) => (
            <TableRow key={r.address}>
              <TableCell className="py-3 pl-4">
                <div className="flex min-w-0 items-center gap-3">
                  <PairLogo tokens={r.tokens} name={r.name} />
                  <div className="min-w-0">
                    <Link
                      to="/analytics"
                      search={{ pool: r.address }}
                      className="flex items-center gap-1.5 text-sm font-semibold hover:text-brand"
                    >
                      <span className="truncate">{r.name}</span>
                      {r.pool?.tokenX.verified && r.pool.tokenY.verified && (
                        <BadgeCheckIcon aria-label="Verified" className="size-3.5 shrink-0 text-profit" />
                      )}
                    </Link>
                    <div className="text-[0.7rem] text-muted-foreground">
                      {r.pool ? `Bin step ${r.pool.binStep} · Fee ${percent(r.pool.baseFeePct)}` : shortAddr(r.address)}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-right font-medium">
                {r.pool ? <Amount usd={r.pool.tvl} solPrice={solPrice} /> : "—"}
              </TableCell>
              <TableCell className="pl-8">
                {r.pool ? (
                  <div className="w-28">
                    <div className="font-medium">
                      <Amount usd={r.pool.volume["24h"]} solPrice={solPrice} />
                    </div>
                    <div className="mt-1 h-1 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.max(3, (r.pool.volume["24h"] / maxVolume) * 100)}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="text-right font-medium">
                {r.pool ? <Amount usd={r.pool.fees24h} solPrice={solPrice} /> : "—"}
              </TableCell>
              <TableCell className="text-right font-medium">{r.pool ? percent(apr(r.pool.feeTvl)) : "—"}</TableCell>
              <TableCell className="text-muted-foreground">{r.at ? timeAgo(r.at, now) : "None yet"}</TableCell>
              <TableCell>
                <PoolStatus pool={r.pool} loaded={screener !== undefined} />
              </TableCell>
              <TableCell className="pr-4 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon-sm" aria-label={`Actions for ${r.name}`} disabled={r.removing}>
                      {r.removing ? <Spinner /> : <MoreHorizontalIcon />}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link to="/analytics" search={{ pool: r.address }}>
                        <ExternalLinkIcon /> Open analytics
                      </Link>
                    </DropdownMenuItem>
                    {r.onRemove && (
                      <DropdownMenuItem variant="destructive" onSelect={r.onRemove}>
                        <XIcon /> Stop watching
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination
        total={shown.length}
        page={current}
        pages={pages}
        pageSize={pageSize}
        sizes={PAGE_SIZES}
        onPage={setPage}
        onPageSize={(size) => pick(() => setPageSize(size))}
      />
    </section>
  );
}

function PoolStatus({ pool, loaded }: { pool: ScreenerPool | undefined; loaded: boolean }) {
  if (!loaded) return <span className="text-muted-foreground">—</span>;
  if (!pool)
    return (
      <span
        title="Below the screener's TVL and volume floor, so its market numbers are not loaded."
        className="inline-flex items-center gap-1.5 rounded-md border bg-muted px-2 py-1 text-[0.7rem] font-medium text-muted-foreground"
      >
        <span className="size-1.5 rounded-full bg-muted-foreground" />
        Not listed
      </span>
    );
  const [warning] = warnings(pool);
  return warning ? (
    <span
      title={warning.detail}
      className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-1 text-[0.7rem] font-medium text-amber-600 dark:text-amber-400"
    >
      <span className="size-1.5 rounded-full bg-amber-500" />
      {warning.label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-profit/25 bg-profit/12 px-2 py-1 text-[0.7rem] font-medium text-profit">
      <span className="size-1.5 rounded-full bg-profit" />
      Watching
    </span>
  );
}
