import { ChevronRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { solscanAccount } from "@/lib/format";
import { fullDuration, money, timeAgo, utcStamp } from "../money";
import { type ClosedPoolRow, type ClosedPosition, type Currency, closedPoolRows, type PoolMeta } from "../portfolio";
import { usePortfolio } from "../use-portfolio-view";
import { Pnl, ShareButton, Tile } from "./active-figures";
import { CurrencyToggle } from "./currency-toggle";
import { PnlShareCard } from "./pnl-share-card";
import { PoolIdentity, SolscanLink } from "./pool-identity";
import { ActivityList, useActivity } from "./position-activity";
import { ShareDialog } from "./share-dialog";
import {
  Expander,
  Pagination,
  PoolFilter,
  SCROLL_TABLE,
  type Sort,
  SortHead,
  sortBy,
  type View,
  ViewToggle,
} from "./table-controls";

const SORTS = {
  positions: (r: ClosedPoolRow) => r.positions.length,
  pnl: (r: ClosedPoolRow, c: Currency) => r[c].pnl,
  lastClose: (r: ClosedPoolRow) => r.lastClosedAt,
  duration: (r: ClosedPoolRow) => r.heldMs,
  deposits: (r: ClosedPoolRow, c: Currency) => r[c].deposit,
  withdrawals: (r: ClosedPoolRow, c: Currency) => r[c].withdraw,
  fees: (r: ClosedPoolRow, c: Currency) => r[c].fees,
} satisfies Record<string, (row: ClosedPoolRow, currency: Currency) => number>;

type SortKey = keyof typeof SORTS;

/** A pool, or one position in it, to put on a share card. */
interface ShareTarget {
  pool: PoolMeta;
  positions: ClosedPosition[];
}

const PAGE_SIZES = [10, 20, 50, 100];
const COLUMNS = 9;

export function ClosedPositions({
  closed,
  pools,
  currency,
}: {
  closed: ClosedPosition[];
  pools: PoolMeta[];
  currency: Currency;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort<SortKey>>({ key: "lastClose", dir: "desc" });
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0] ?? 10);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [view, setView] = useState<View>("table");
  const [share, setShare] = useState<ShareTarget | null>(null);
  const [sharing, setSharing] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = closedPoolRows(closed, pools).filter((r) => !q || r.pool.pair.toLowerCase().includes(q));
    return sortBy(matched, (row, key) => SORTS[key](row, currency), sort);
  }, [closed, pools, currency, sort, query]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * pageSize, (current + 1) * pageSize);
  const toggle = (address: string) => {
    const next = new Set(expanded);
    if (!next.delete(address)) next.add(address);
    setExpanded(next);
  };
  const head = { sort, onSort: setSort };
  const openShare = (target: ShareTarget) => {
    setShare(target);
    setSharing(true);
  };
  // The cards have no room for positions, so their chevron opens the pool in the table.
  const openInTable = (address: string) => {
    setExpanded(new Set([...expanded, address]));
    setView("table");
  };
  const empty = closed.length === 0 ? "No closed positions." : `No pools match “${query.trim()}”.`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <CurrencyToggle />
          <PoolFilter
            value={query}
            onChange={(q) => {
              setQuery(q);
              setPage(0);
            }}
          />
        </div>
        <div className="flex items-center gap-1.25">
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>
      <div className="-mx-2 flex min-h-0 flex-1 flex-col">
        {view === "grid" ? (
          <ClosedGrid rows={shown} currency={currency} empty={empty} onShare={openShare} onOpen={openInTable} />
        ) : (
          <div className={SCROLL_TABLE}>
            <Table className="min-w-[64rem]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10" />
                  <TableHead>Pool</TableHead>
                  <SortHead id="positions" className="text-center" {...head}>
                    Positions
                  </SortHead>
                  <SortHead id="pnl" className="text-right" {...head}>
                    PnL
                  </SortHead>
                  <SortHead id="lastClose" className="text-right" {...head}>
                    Last Close
                  </SortHead>
                  <SortHead id="duration" className="text-right" {...head}>
                    Duration
                  </SortHead>
                  <SortHead id="deposits" className="text-right" {...head}>
                    Total Deposits
                  </SortHead>
                  <SortHead id="withdrawals" className="text-right" {...head}>
                    Total Withdrawals
                  </SortHead>
                  <SortHead id="fees" className="pr-3 text-right" {...head}>
                    Fees
                  </SortHead>
                </TableRow>
              </TableHeader>
              <TableBody className="tabular-nums">
                {shown.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={COLUMNS} className="py-10 text-center text-muted-foreground">
                      {empty}
                    </TableCell>
                  </TableRow>
                )}
                {shown.map((row) => (
                  <PoolRows
                    key={row.pool.address}
                    row={row}
                    open={expanded.has(row.pool.address)}
                    onToggle={() => toggle(row.pool.address)}
                    currency={currency}
                    onShare={openShare}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <Pagination
          total={rows.length}
          page={current}
          pages={pages}
          pageSize={pageSize}
          sizes={PAGE_SIZES}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(0);
          }}
        />
      </div>
      <ClosedShare target={share} open={sharing} onOpenChange={setSharing} currency={currency} />
    </div>
  );
}

function ClosedShare({
  target,
  open,
  onOpenChange,
  currency,
}: {
  target: ShareTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: Currency;
}) {
  const row = target && closedPoolRows(target.positions, [target.pool])[0];
  const m = (v: number) => money(v, currency);
  return (
    <ShareDialog
      open={open}
      onOpenChange={onOpenChange}
      hint="Click any card section to hide or restore it"
      title={`${target?.pool.pair ?? "Closed"} position`}
    >
      {row && (
        <PnlShareCard
          pool={row.pool}
          status="Closed"
          duration={fullDuration(row.heldMs)}
          totals={row[currency]}
          currency={currency}
          details={[
            ["Positions", row.positions.length],
            ["Total deposits", m(row[currency].deposit)],
            ["Current deposits", m(0)],
            ["Withdrawals", m(row[currency].withdraw)],
            ["Fees", m(row[currency].fees)],
          ]}
        />
      )}
    </ShareDialog>
  );
}

function ClosedGrid({
  rows,
  currency,
  empty,
  onShare,
  onOpen,
}: {
  rows: ClosedPoolRow[];
  currency: Currency;
  empty: string;
  onShare: (target: ShareTarget) => void;
  onOpen: (address: string) => void;
}) {
  const fetchedAt = usePortfolio().fetchedAt;
  if (rows.length === 0) return <p className="flex-1 py-10 text-center text-muted-foreground">{empty}</p>;
  return (
    <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto px-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {rows.map((row) => {
        const t = row[currency];
        const target = { pool: row.pool, positions: row.positions.map((p) => p.position) };
        return (
          <article key={row.pool.address} className="rounded-lg border bg-card p-2 text-xs tabular-nums">
            <div className="flex items-start justify-between gap-2 p-1.5">
              <PoolIdentity pool={row.pool} />
              <button
                type="button"
                aria-label={`Show ${row.pool.pair} positions`}
                onClick={() => onOpen(row.pool.address)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronRightIcon className="size-4" />
              </button>
            </div>
            <div className="mt-2 grid gap-0.5">
              <div className="grid grid-cols-2 gap-0.5">
                <Tile label="P&L" className="text-right" action={<ShareButton onClick={() => onShare(target)} />}>
                  <Pnl totals={t} currency={currency} />
                </Tile>
                <div className="grid grid-cols-2 gap-x-3 rounded-md border bg-background/90 p-3 [&>*]:min-w-0">
                  <Tile label="Positions" className="border-0 bg-transparent p-0 text-center">
                    {row.positions.length}
                  </Tile>
                  <Tile label="Duration" className="border-0 bg-transparent p-0 text-right">
                    {fullDuration(row.heldMs)}
                  </Tile>
                </div>
              </div>
              <Tile label="Last close" className="text-right">
                <div>{utcStamp(row.lastClosedAt, " at ")}</div>
                <div className="font-semibold">{timeAgo(row.lastClosedAt, fetchedAt)}</div>
              </Tile>
              <div className="grid grid-cols-3 gap-0.5">
                <Tile label="Deposits" className="text-right">
                  {money(t.deposit, currency)}
                </Tile>
                <Tile label="Withdrawals" className="text-right">
                  {money(t.withdraw, currency)}
                </Tile>
                <Tile label="Fees" className="text-right">
                  {money(t.fees, currency)}
                </Tile>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function PoolRows({
  row,
  open,
  onToggle,
  currency,
  onShare,
}: {
  row: ClosedPoolRow;
  open: boolean;
  onToggle: () => void;
  currency: Currency;
  onShare: (target: ShareTarget) => void;
}) {
  const fetchedAt = usePortfolio().fetchedAt;
  const t = row[currency];
  return (
    <>
      <TableRow>
        <TableCell className="pl-2.5">
          <Expander open={open} onToggle={onToggle} label={`Show ${row.pool.pair} positions`} />
        </TableCell>
        <TableCell>
          <PoolIdentity pool={row.pool} />
        </TableCell>
        <TableCell className="text-center font-medium">{row.positions.length}</TableCell>
        <TableCell>
          <div className="flex items-center justify-end gap-2 text-right">
            <Pnl totals={t} currency={currency} />
            <ShareButton onClick={() => onShare({ pool: row.pool, positions: row.positions.map((p) => p.position) })} />
          </div>
        </TableCell>
        <TableCell className="text-right">
          <div className="text-muted-foreground">{utcStamp(row.lastClosedAt, " at ")}</div>
          <div className="font-semibold">{timeAgo(row.lastClosedAt, fetchedAt)}</div>
        </TableCell>
        <TableCell className="text-right">{fullDuration(row.heldMs)}</TableCell>
        <TableCell className="text-right">{money(t.deposit, currency)}</TableCell>
        <TableCell className="text-right">{money(t.withdraw, currency)}</TableCell>
        <TableCell className="pr-3 text-right">{money(t.fees, currency)}</TableCell>
      </TableRow>
      {open &&
        row.positions.map(({ position, n }) => (
          <PositionRows
            key={position.address}
            pool={row.pool}
            position={position}
            n={n}
            currency={currency}
            onShare={onShare}
          />
        ))}
    </>
  );
}

function PositionRows({
  pool,
  position,
  n,
  currency,
  onShare,
}: {
  pool: PoolMeta;
  position: ClosedPosition;
  n: number;
  currency: Currency;
  onShare: (target: ShareTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  const a = position[currency];
  return (
    <>
      <TableRow className="bg-muted/20 hover:bg-muted/20">
        <TableCell />
        <TableCell>
          <div className="flex items-center gap-1.5 pl-6 font-semibold">
            <Expander open={open} onToggle={() => setOpen(!open)} label={`Show position #${n} activity`} />
            <SolscanLink href={solscanAccount(position.address)} label={`Position #${n} on Solscan`} />
            Position #{n}
          </div>
        </TableCell>
        <TableCell />
        <TableCell>
          <div className="flex items-center justify-end gap-2 text-right">
            <Pnl totals={a} currency={currency} />
            <ShareButton onClick={() => onShare({ pool, positions: [position] })} />
          </div>
        </TableCell>
        <TableCell className="text-right text-muted-foreground">
          <div>Opened: {utcStamp(position.openedAt, " at ")}</div>
          <div>Closed: {utcStamp(position.closedAt, " at ")}</div>
        </TableCell>
        <TableCell className="text-right">{fullDuration(position.closedAt - position.openedAt)}</TableCell>
        <TableCell className="text-right">{money(a.deposit, currency)}</TableCell>
        <TableCell className="text-right">{money(a.withdraw, currency)}</TableCell>
        <TableCell className="pr-3 text-right">{money(a.fees, currency)}</TableCell>
      </TableRow>
      {open && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={COLUMNS} className="p-2">
            <PositionActivity pool={pool} position={position} currency={currency} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function PositionActivity({
  pool,
  position,
  currency,
}: {
  pool: PoolMeta;
  position: ClosedPosition;
  currency: Currency;
}) {
  const activity = useActivity(position.address, true);
  return <ActivityList activity={activity} pool={{ ...pool, fdv: null }} currency={currency} layout="lines" />;
}
