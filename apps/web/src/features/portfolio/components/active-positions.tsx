import { ChevronRightIcon, LinkIcon, XIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { solscanAccount } from "@/lib/format";
import { type ActivePool, type ActivePosition, type Currency, openedAt, poolTotals } from "../portfolio";
import { ActiveDetailDialog } from "./active-detail-dialog";
import { Age, Deposits, FdvTvl, Fees, Pnl, RangeStatus, ShareButton, Tile, Withdrawals } from "./active-figures";
import { ActiveShare, type ShareTarget } from "./active-share";
import { CurrencyToggle } from "./currency-toggle";
import { PoolIdentity, SolscanLink } from "./pool-identity";
import { ActivityList, useActivity } from "./position-activity";
import { Distribution } from "./position-distribution";
import { Panel } from "./summary-panels";
import {
  Expander,
  PoolFilter,
  SCROLL_TABLE,
  SortHead,
  sortBy,
  type Sort as TableSort,
  type View,
  ViewToggle,
} from "./table-controls";

const SORTS = {
  fdv: (p: ActivePool) => p.fdv ?? Number.NEGATIVE_INFINITY,
  positions: (p: ActivePool) => p.positions.length,
  pnl: (p: ActivePool, c: Currency) => poolTotals(p.positions, c).pnl,
  // The oldest position decides a pool's age; an unknown open time counts as newest.
  age: (p: ActivePool) => -(openedAt(p.positions) ?? Number.POSITIVE_INFINITY),
  deposits: (p: ActivePool, c: Currency) => poolTotals(p.positions, c).deposit,
  withdrawals: (p: ActivePool, c: Currency) => poolTotals(p.positions, c).withdraw,
  fees: (p: ActivePool, c: Currency) => {
    const t = poolTotals(p.positions, c);
    return t.fees + t.unclaimed;
  },
} satisfies Record<string, (pool: ActivePool, currency: Currency) => number>;

type Sort = TableSort<keyof typeof SORTS>;

const sortPools = (pools: ActivePool[], sort: Sort, currency: Currency) =>
  sortBy(pools, (pool, key) => SORTS[key](pool, currency), sort);

export function ActivePositions({ pools, currency }: { pools: ActivePool[]; currency: Currency }) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("table");
  const [sort, setSort] = useState<Sort>({ key: "age", dir: "desc" });
  const [share, setShare] = useState<ShareTarget | null>(null);
  const [sharing, setSharing] = useState(false);
  // By address, so a background refresh shows the new numbers in an open dialog.
  const [detail, setDetail] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q ? pools.filter((p) => p.pair.toLowerCase().includes(q)) : pools;
    return sortPools(matched, sort, currency);
  }, [pools, query, sort, currency]);

  const openShare = (target: ShareTarget) => {
    setShare(target);
    setSharing(true);
  };
  const openDetail = (pool: ActivePool) => {
    setDetail(pool.address);
    setDetailOpen(true);
  };

  const empty = (
    <p className="py-8 text-center text-muted-foreground">
      {pools.length === 0 ? "No active positions." : `No pools match “${query.trim()}”.`}
    </p>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <CurrencyToggle />
          <PoolFilter value={query} onChange={setQuery} />
        </div>
        <div className="flex items-center gap-1.25">
          <ViewToggle view={view} onChange={setView} />
          {/* Signing needs a connected wallet; this dashboard only reads. */}
          <button
            type="button"
            disabled
            title="Coming soon"
            className="ml-1 inline-flex h-6 items-center gap-1.5 rounded-md border border-loss/60 px-2 text-xs font-medium text-loss disabled:cursor-not-allowed"
          >
            <XIcon className="size-2.75" />
            Close all
          </button>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="inline-flex h-6 items-center gap-1.5 rounded-md border border-brand/60 px-2 text-xs font-medium text-brand disabled:cursor-not-allowed"
          >
            <LinkIcon className="size-2.75" />
            Claim all
          </button>
        </div>
      </div>

      {view === "table" ? (
        <PoolTable pools={shown} sort={sort} onSort={setSort} currency={currency} onShare={openShare} empty={empty} />
      ) : (
        <PoolGrid pools={shown} currency={currency} onShare={openShare} onOpen={openDetail} empty={empty} />
      )}

      <ActiveDetailDialog
        pool={pools.find((p) => p.address === detail) ?? null}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        currency={currency}
        onShare={openShare}
      />
      <ActiveShare target={share} open={sharing} onOpenChange={setSharing} currency={currency} />
    </div>
  );
}

// ---------- Table ----------

const COLUMNS = 10;

function PoolTable({
  pools,
  sort,
  onSort,
  currency,
  onShare,
  empty,
}: {
  pools: ActivePool[];
  sort: Sort;
  onSort: (sort: Sort) => void;
  currency: Currency;
  onShare: (target: ShareTarget) => void;
  empty: ReactNode;
}) {
  const all = pools.flatMap((p) => p.positions);
  const t = poolTotals(all, currency);
  const head = { sort, onSort };
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const allOpen = pools.length > 0 && pools.every((p) => expanded.has(p.address));
  const toggle = (address: string) => {
    const next = new Set(expanded);
    if (!next.delete(address)) next.add(address);
    setExpanded(next);
  };
  return (
    <div className={`-mx-2 ${SCROLL_TABLE}`}>
      <Table className="min-w-[64rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-12.75 pl-2.5">
              <RowControls
                open={allOpen}
                onToggle={() => setExpanded(allOpen ? new Set() : new Set(pools.map((p) => p.address)))}
                label={allOpen ? "Collapse all pools" : "Expand all pools"}
              />
            </TableHead>
            <TableHead>Pool</TableHead>
            <SortHead id="fdv" {...head}>
              FDV
            </SortHead>
            <TableHead>Distribution</TableHead>
            <SortHead id="positions" className="text-center" {...head}>
              Positions
            </SortHead>
            <SortHead id="pnl" className="text-right" {...head}>
              PnL
            </SortHead>
            <SortHead id="age" className="text-right" {...head}>
              Age
            </SortHead>
            <SortHead id="deposits" className="text-right" {...head}>
              Deposits
            </SortHead>
            <SortHead id="withdrawals" className="text-right" {...head}>
              Withdrawals
            </SortHead>
            <SortHead id="fees" className="pr-3.25 text-right" {...head}>
              Fees
            </SortHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {pools.length === 0 ? (
            <TableRow>
              <TableCell colSpan={COLUMNS}>{empty}</TableCell>
            </TableRow>
          ) : (
            <TableRow className="bg-muted hover:bg-muted">
              <TableCell />
              <TableCell className="font-semibold">Total</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-center font-semibold">{all.length}</TableCell>
              <TableCell className="text-right">
                <Pnl totals={t} currency={currency} />
              </TableCell>
              <TableCell />
              <TableCell className="text-right">
                <Deposits totals={t} currency={currency} />
              </TableCell>
              <TableCell className="text-right">
                <Withdrawals totals={t} currency={currency} />
              </TableCell>
              <TableCell className="pr-3.25 text-right">
                <Fees totals={t} currency={currency} />
              </TableCell>
            </TableRow>
          )}
          {pools.map((pool) => (
            <PoolRows
              key={pool.address}
              pool={pool}
              open={expanded.has(pool.address)}
              onToggle={() => toggle(pool.address)}
              currency={currency}
              onShare={onShare}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Row selection only feeds the bulk actions, which need a connected wallet, so the box stays disabled. */
function RowControls({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Checkbox disabled aria-label="Select" title="Coming soon" />
      <Expander open={open} onToggle={onToggle} label={label} />
    </div>
  );
}

function PoolRows({
  pool,
  open,
  onToggle,
  currency,
  onShare,
}: {
  pool: ActivePool;
  open: boolean;
  onToggle: () => void;
  currency: Currency;
  onShare: (target: ShareTarget) => void;
}) {
  return (
    <>
      <TableRow>
        <TableCell className="pl-2.5">
          <RowControls open={open} onToggle={onToggle} label={`Show ${pool.pair} positions`} />
        </TableCell>
        <TableCell>
          <PoolIdentity pool={pool} />
        </TableCell>
        <TableCell>
          <FdvTvl pool={pool} />
        </TableCell>
        <FigureCells pool={pool} positions={pool.positions} currency={currency} onShare={onShare} />
      </TableRow>
      {open &&
        pool.positions.map((position, i) => (
          <PositionRows
            key={position.address}
            pool={pool}
            position={position}
            n={i + 1}
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
  pool: ActivePool;
  position: ActivePosition;
  n: number;
  currency: Currency;
  onShare: (target: ShareTarget) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow className="bg-muted/30 hover:bg-muted/30">
        <TableCell className="pl-2.5">
          <Checkbox disabled aria-label="Select" title="Coming soon" />
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5 pl-6 font-semibold">
            <Expander open={open} onToggle={() => setOpen(!open)} label={`Show position #${n} activity`} />
            <SolscanLink href={solscanAccount(position.address)} label={`Position #${n} on Solscan`} />
            Position #{n}
          </div>
        </TableCell>
        <TableCell />
        <FigureCells pool={pool} positions={[position]} currency={currency} onShare={onShare} />
      </TableRow>
      {open && (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
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
  pool: ActivePool;
  position: ActivePosition;
  currency: Currency;
}) {
  const activity = useActivity(position.address, true);
  return <ActivityList activity={activity} pool={pool} currency={currency} layout="lines" />;
}

/** The columns from Distribution to Fees, shared by pool rows and position rows. */
function FigureCells({
  pool,
  positions,
  currency,
  onShare,
}: {
  pool: ActivePool;
  positions: ActivePosition[];
  currency: Currency;
  onShare: (target: ShareTarget) => void;
}) {
  const t = poolTotals(positions, currency);
  return (
    <>
      <TableCell>
        <Distribution pool={pool} positions={positions} />
      </TableCell>
      <TableCell>
        <RangeStatus pool={pool} positions={positions} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1.5 text-right">
          <Pnl totals={t} currency={currency} />
          <ShareButton onClick={() => onShare({ pool, positions })} />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Age positions={positions} />
      </TableCell>
      <TableCell className="text-right">
        <Deposits totals={t} currency={currency} />
      </TableCell>
      <TableCell className="text-right">
        <Withdrawals totals={t} currency={currency} />
      </TableCell>
      <TableCell className="pr-3.25 text-right">
        <Fees totals={t} currency={currency} />
      </TableCell>
    </>
  );
}

// ---------- Grid ----------

function PoolGrid({
  pools,
  currency,
  onShare,
  onOpen,
  empty,
}: {
  pools: ActivePool[];
  currency: Currency;
  onShare: (target: ShareTarget) => void;
  onOpen: (pool: ActivePool) => void;
  empty: ReactNode;
}) {
  const all = pools.flatMap((p) => p.positions);
  const t = poolTotals(all, currency);
  return (
    <div className="-mx-2 min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-3.25">
      <Panel>
        <div className="flex items-center justify-between gap-2.5">
          <h2 className="text-sm font-semibold">Portfolio totals</h2>
          <span className="text-xs text-muted-foreground">
            {pools.length} pool{pools.length === 1 ? "" : "s"} • {all.length} position{all.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="PnL" className="text-right">
            <Pnl totals={t} currency={currency} />
          </Tile>
          <Tile label="Deposits" className="text-right">
            <Deposits totals={t} currency={currency} />
          </Tile>
          <Tile label="Withdrawals" className="text-right">
            <Withdrawals totals={t} currency={currency} />
          </Tile>
          <Tile label="Fees" className="text-right">
            <Fees totals={t} currency={currency} />
          </Tile>
        </div>
      </Panel>
      {pools.length === 0 ? (
        <Panel>{empty}</Panel>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {pools.map((pool) => (
            <PoolCard key={pool.address} pool={pool} currency={currency} onShare={onShare} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  );
}

function PoolCard({
  pool,
  currency,
  onShare,
  onOpen,
}: {
  pool: ActivePool;
  currency: Currency;
  onShare: (target: ShareTarget) => void;
  onOpen: (pool: ActivePool) => void;
}) {
  const t = poolTotals(pool.positions, currency);
  return (
    <article className="rounded-lg border bg-card p-2.5">
      <div className="flex items-start justify-between gap-1.5">
        <PoolIdentity pool={pool} />
        <button
          type="button"
          aria-label={`${pool.pair} details`}
          onClick={() => onOpen(pool)}
          className="rounded p-0.75 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronRightIcon className="size-3.25" />
        </button>
      </div>
      <Tile label="Distribution" className="mt-2.5">
        <div className="flex items-center gap-3.25">
          <FdvTvl pool={pool} />
          <Distribution pool={pool} positions={pool.positions} className="min-w-0 flex-1" />
        </div>
      </Tile>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-xs">
        <Tile label="Positions">
          <RangeStatus pool={pool} positions={pool.positions} />
        </Tile>
        <Tile label="Age" className="text-right">
          <Age positions={pool.positions} />
        </Tile>
        <Tile
          label="PnL"
          className="text-right"
          action={<ShareButton onClick={() => onShare({ pool, positions: pool.positions })} />}
        >
          <Pnl totals={t} currency={currency} />
        </Tile>
        <Tile label="Deposits" className="text-right">
          <Deposits totals={t} currency={currency} />
        </Tile>
        <Tile label="Withdrawals" className="text-right">
          <Withdrawals totals={t} currency={currency} />
        </Tile>
        <Tile label="Fees" className="text-right">
          <Fees totals={t} currency={currency} />
        </Tile>
      </div>
    </article>
  );
}
