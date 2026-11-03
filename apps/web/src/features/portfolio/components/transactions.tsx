import { type ReactNode, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStamp } from "@/features/timezone/timezone";
import { solscanAccount, solscanTx } from "@/lib/format";
import {
  type Currency,
  type Portfolio,
  type PositionHistory,
  type TransactionPool,
  type Transactions as TransactionsData,
  transactionPools,
  transactionRows,
} from "../portfolio";
import { CurrencyToggle } from "./currency-toggle";
import { Notice } from "./notice";
import { PoolBadges, SolscanLink, TokenIcon } from "./pool-identity";
import { EventBadge, FdvChip, TokenLines, value } from "./position-activity";
import { Pagination, PoolFilter, SCROLL_TABLE } from "./table-controls";

const PAGE_SIZES = [25, 50, 100];
const COLUMNS = 6;

export function Transactions({
  transactions: { histories, progress },
  portfolio,
  currency,
}: {
  transactions: TransactionsData;
  portfolio: Portfolio;
  currency: Currency;
}) {
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0] ?? 25);
  const [page, setPage] = useState(0);
  const missing = progress.total - progress.loaded;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {progress.running && missing > 0 && (
        <Notice>
          Loading transaction history: {progress.loaded} of {progress.total} positions. Older rows appear as they load.
        </Notice>
      )}
      {!progress.running && missing > 0 && (
        <Notice>
          {missing} {missing === 1 ? "position" : "positions"} failed to load and will retry on the next refresh.
        </Notice>
      )}
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
      <div className="-mx-2 flex min-h-0 flex-1 flex-col">
        {histories.length === 0 && progress.running ? (
          <TransactionsSkeleton rows={pageSize} />
        ) : (
          <TransactionsTable
            histories={histories}
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
        )}
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
  const stamp = useStamp();
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
              <TableCell className="text-muted-foreground">{stamp(row.at)}</TableCell>
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
    <div className={SCROLL_TABLE}>
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
  );
}
