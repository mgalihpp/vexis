import { useSuspenseQuery } from "@tanstack/react-query";
import { BadgeCheckIcon } from "lucide-react";
import { type ReactNode, Suspense, useMemo } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { type BalanceRow, type BalanceValue, balancesView, type WalletBalances } from "../balances";
import { compactUsd, formatAmount, formatPrice, money, pct, tone } from "../money";
import type { Currency } from "../portfolio";
import { balancesQuery } from "../portfolio.queries";
import { CurrencyToggle } from "./currency-toggle";
import { OrganicScore, TokenIcon } from "./pool-identity";

/** The query settles to this instead of rejecting, so a failure shows inside the table. */
export type BalancesResult = { ok: true; balances: WalletBalances } | { ok: false; message: string };

const COLUMNS = 5;
const NONE = "–";

const show = (v: BalanceValue, currency: Currency) => {
  const n = v[currency];
  return n === null ? NONE : money(n, currency);
};

type BalancesProps = { wallet: string; solPrice: number | null; currency: Currency };

export function Balances(props: BalancesProps) {
  return (
    <div className="flex flex-1 flex-col gap-2">
      <div className="flex items-center">
        <CurrencyToggle />
      </div>
      <div className="-mx-2 flex flex-1 flex-col">
        <Suspense fallback={<BalancesSkeleton />}>
          <BalancesResultView {...props} />
        </Suspense>
      </div>
    </div>
  );
}

function BalancesResultView({ wallet, solPrice, currency }: BalancesProps) {
  const { data: r } = useSuspenseQuery(balancesQuery(wallet));
  if (r.ok) return <BalancesTable balances={r.balances} solPrice={solPrice} currency={currency} />;
  return (
    <Frame>
      <TableRow>
        <TableCell colSpan={COLUMNS} className="py-10 text-center text-loss">
          Could not load balances: {r.message}
        </TableCell>
      </TableRow>
    </Frame>
  );
}

function BalancesTable({
  balances,
  solPrice,
  currency,
}: {
  balances: WalletBalances;
  solPrice: number | null;
  currency: Currency;
}) {
  const view = useMemo(() => balancesView(balances, solPrice), [balances, solPrice]);
  const groups = view.groups.filter((g) => g.rows.length > 0);
  return (
    <>
      <Frame>
        {groups.length === 0 ? (
          <TableRow>
            <TableCell colSpan={COLUMNS} className="py-10 text-center text-muted-foreground">
              No token balances.
            </TableCell>
          </TableRow>
        ) : (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={COLUMNS - 1} className="pl-3 font-semibold">
              Grand Total Value
            </TableCell>
            <TableCell className="pr-3 text-right font-semibold">{show(view.total, currency)}</TableCell>
          </TableRow>
        )}
        {groups.map((group) => (
          <GroupRows key={group.id} label={group.label} rows={group.rows} total={group.total} currency={currency} />
        ))}
      </Frame>
      {view.unpriced > 0 && (
        <p className="px-3 py-2.5 text-xs text-muted-foreground">
          {view.unpriced} {view.unpriced === 1 ? "token has" : "tokens have"} no Jupiter price, shown as {NONE} and left
          out of every total.
        </p>
      )}
    </>
  );
}

function GroupRows({
  label,
  rows,
  total,
  currency,
}: {
  label: string;
  rows: BalanceRow[];
  total: BalanceValue;
  currency: Currency;
}) {
  return (
    <>
      <TableRow className="bg-muted/50 hover:bg-muted/50">
        <TableCell colSpan={COLUMNS - 1} className="pl-3 font-semibold">
          {label}
          <span className="ml-1.5 rounded-sm bg-foreground/10 px-1 py-0.5 text-[0.625rem] text-muted-foreground">
            {rows.length}
          </span>
        </TableCell>
        <TableCell className="pr-3 text-right font-semibold">{show(total, currency)}</TableCell>
      </TableRow>
      {rows.map((row) => (
        <TableRow key={row.token.mint}>
          <TableCell className="pl-3">
            <TokenCell row={row} />
          </TableCell>
          <TableCell className="text-right">
            <Fdv row={row} />
          </TableCell>
          <TableCell className="text-right">
            {row.token.price === null ? NONE : `$${formatPrice(row.token.price)}`}
          </TableCell>
          <TableCell className="text-right">{formatAmount(row.amount)}</TableCell>
          <TableCell className="pr-3 text-right font-semibold">{show(row.value, currency)}</TableCell>
        </TableRow>
      ))}
    </>
  );
}

function TokenCell({ row: { token } }: { row: BalanceRow }) {
  return (
    <div className="flex items-center gap-2">
      <TokenIcon token={token} className="size-6 text-[0.6rem]" />
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className="font-semibold whitespace-nowrap">{token.symbol}</span>
          {token.verified && <BadgeCheckIcon aria-label="Verified" className="size-3.5 shrink-0 text-profit" />}
          {token.verified && token.organicScore !== null && <OrganicScore score={token.organicScore} />}
        </div>
        <div className="max-w-56 truncate text-muted-foreground" title={token.name}>
          {token.name}
        </div>
      </div>
    </div>
  );
}

function Fdv({ row: { token } }: { row: BalanceRow }) {
  if (token.fdv === null) return NONE;
  const change = token.priceChange24h;
  return (
    <div className="flex flex-col items-end">
      {change !== null && (
        <span className={`text-[0.625rem] ${tone(change)}`}>
          {change > 0 ? "+" : ""}
          {pct(change / 100)}
        </span>
      )}
      <span>{compactUsd(token.fdv)}</span>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[48rem]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-3">Token</TableHead>
            <TableHead className="text-right">FDV</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="pr-3 text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">{children}</TableBody>
      </Table>
    </div>
  );
}

const SKELETON_CELLS = ["w-36", "ml-auto w-14", "ml-auto w-16", "ml-auto w-20", "ml-auto w-12"];
const SKELETON_ROWS = 8;

function BalancesSkeleton() {
  return (
    <>
      <Frame>
        {Array.from({ length: SKELETON_ROWS }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder rows have no identity
          <TableRow key={i} className="hover:bg-transparent">
            {SKELETON_CELLS.map((width) => (
              <TableCell key={width} className="first:pl-3 last:pr-3">
                <div className={`h-4 animate-pulse rounded bg-muted ${width}`} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </Frame>
      <p className="px-3 py-2.5 text-xs text-muted-foreground">Loading balances from Jupiter…</p>
    </>
  );
}
