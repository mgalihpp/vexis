import { Await } from "@tanstack/react-router";
import { type ReactNode, useDeferredValue, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { solscanAccount, solscanTx } from "@/lib/format";
import { utcStamp } from "../money";
import {
  type Currency,
  type Portfolio,
  type PositionHistory,
  type TransactionPool,
  transactionPools,
  transactionRows,
} from "../portfolio";
import { CurrencyToggle } from "./currency-toggle";
import { PoolBadges, SolscanLink, TokenIcon } from "./pool-identity";
import { EventBadge, FdvChip, TokenLines, value } from "./position-activity";
import { Pagination, PoolFilter } from "./table-controls";

/** The loader settles to this instead of rejecting, so a failure shows inside the table. */
export type TransactionsResult = { ok: true; histories: PositionHistory[] } | { ok: false; message: string };

const PAGE_SIZES = [25, 50, 100];
const COLUMNS = 6;

export function Transactions({
  result,
  portfolio,
  currency,
}: {
  result: Promise<TransactionsResult>;
  portfolio: Portfolio;
  currency: Currency;
}) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0] ?? 25);
  const [page, setPage] = useState(0);
  // The live refresh hands over a new promise every 15 s; keep the settled one on screen until it resolves.
  const deferred = useDeferredValue(result);
  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <CurrencyToggle />
        <PoolFilter
          value={query}
          onChange={(q) => {
            setQuery(q);
            setPage(0);
          }}
        />
      </div>
      <div className="-mx-2 flex flex-1 flex-col">
        <Await promise={deferred} fallback={<TransactionsSkeleton rows={pageSize} />}>
          {(r) =>
            r.ok ? (
              <TransactionsTable
                histories={r.histories}
                portfolio={portfolio}
                currency={currency}
                query={query}
                page={page}
                pageSize={pageSize}
                onPage={setPage}
                onPageSize={(size) => {
                  setPageSize(size);
                  setPage(0);
                }}
              />
            ) : (
              <Frame>
                <TableRow>
                  <TableCell colSpan={COLUMNS} className="py-10 text-center text-loss">
                    Could not load transactions: {r.message}
                  </TableCell>
                </TableRow>
              </Frame>
            )
          }
        </Await>
      </div>
    </div>
  );
}

function TransactionsTable({
  histories,
  portfolio,
  currency,
  query,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  histories: PositionHistory[];
  portfolio: Portfolio;
  currency: Currency;
  query: string;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const pools = useMemo(() => transactionPools(portfolio), [portfolio]);
  const all = useMemo(() => transactionRows(histories, pools, portfolio.solPrice), [histories, pools, portfolio]);
  const q = query.trim().toLowerCase();
  const rows = useMemo(() => (q ? all.filter((r) => r.pool.pair.toLowerCase().includes(q)) : all), [all, q]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * pageSize, (current + 1) * pageSize);
  const empty = all.length === 0 ? "No transactions." : `No pools match “${query.trim()}”.`;
  return (
    <>
      <Frame>
        {shown.length === 0 && (
          <TableRow>
            <TableCell colSpan={COLUMNS} className="py-10 text-center text-muted-foreground">
              {empty}
            </TableCell>
          </TableRow>
        )}
        {shown.map((row) => {
          const href = row.signature ? solscanTx(row.signature) : solscanAccount(row.position);
          return (
            <TableRow key={row.id}>
              <TableCell className="w-10 pl-3">
                <SolscanLink href={href} label={row.signature ? "Transaction on Solscan" : "Position on Solscan"} />
              </TableCell>
              <TableCell>
                <EventBadge type={row.type} href={href} />
              </TableCell>
              <TableCell className="text-muted-foreground">{utcStamp(row.at)}</TableCell>
              <TableCell>
                <PoolCell pool={row.pool} />
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <FdvChip row={row} pool={row.pool} />
                  <TokenLines row={row} pool={row.pool} currency={currency} />
                </div>
              </TableCell>
              <TableCell className="pr-3 text-right font-semibold">{value(row.total[currency], currency)}</TableCell>
            </TableRow>
          );
        })}
      </Frame>
      <Pagination
        total={rows.length}
        page={current}
        pages={pages}
        pageSize={pageSize}
        sizes={PAGE_SIZES}
        onPage={onPage}
        onPageSize={onPageSize}
      />
    </>
  );
}

function PoolCell({ pool }: { pool: TransactionPool }) {
  return (
    <div className="flex w-max items-center gap-2">
      <TokenIcon token={pool.tokenX} className="size-5 text-[0.5rem]" />
      <a
        href={`https://app.meteora.ag/dlmm/${pool.address}`}
        target="_blank"
        rel="noreferrer"
        className="font-semibold whitespace-nowrap hover:text-brand"
      >
        {pool.pair}
      </a>
      <PoolBadges pool={pool} />
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-x-auto">
      <Table className="min-w-[64rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10" />
            <TableHead>Type</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Pool</TableHead>
            <TableHead>Tokens</TableHead>
            <TableHead className="pr-3 text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">{children}</TableBody>
      </Table>
    </div>
  );
}

const SKELETON_CELLS = ["w-3.5", "w-24", "w-32", "w-36", "w-60", "ml-auto w-14"];

function TransactionsSkeleton({ rows }: { rows: number }) {
  return (
    <>
      <Frame>
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
          <TableRow key={i} className="hover:bg-transparent">
            {SKELETON_CELLS.map((width) => (
              <TableCell key={width} className="last:pr-3">
                <div className={`h-4 animate-pulse rounded bg-muted ${width}`} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </Frame>
      <p className="sticky bottom-0 border-t bg-background px-3 py-2.5 text-xs text-muted-foreground">
        Loading every position's history from Meteora…
      </p>
    </>
  );
}
