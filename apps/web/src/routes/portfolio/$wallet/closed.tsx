import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel } from "@/features/portfolio/components/summary-panels";
import { money, tone } from "@/features/portfolio/money";
import { usePortfolioView } from "@/features/portfolio/use-portfolio-view";
import { shortAddr } from "@/lib/format";

export const Route = createFileRoute("/portfolio/$wallet/closed")({
  component: ClosedPositions,
});

const PAGE_SIZE = 50;

const stamp = (ms: number) =>
  new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });

function duration(ms: number) {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function ClosedPositions() {
  const { closed, currency } = usePortfolioView();
  const [page, setPage] = useState(0);
  const newest = [...closed].reverse();
  const pages = Math.max(1, Math.ceil(newest.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = newest.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const m = (v: number) => money(v, currency);

  return (
    <Panel className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Pair</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Closed (UTC)</TableHead>
            <TableHead>Held</TableHead>
            <TableHead className="text-right">Deposited</TableHead>
            <TableHead className="text-right">Withdrawn</TableHead>
            <TableHead className="text-right">Fees</TableHead>
            <TableHead className="pr-4 text-right">P&L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                No closed positions in this range.
              </TableCell>
            </TableRow>
          )}
          {rows.map((p) => {
            const a = p[currency];
            return (
              <TableRow key={p.address}>
                <TableCell className="pl-4 font-medium">{p.pair}</TableCell>
                <TableCell>
                  <a
                    href={`https://solscan.io/account/${p.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-brand"
                  >
                    {shortAddr(p.address)}
                  </a>
                </TableCell>
                <TableCell>{stamp(p.closedAt)}</TableCell>
                <TableCell>{duration(p.closedAt - p.openedAt)}</TableCell>
                <TableCell className="text-right">{m(a.deposit)}</TableCell>
                <TableCell className="text-right">{m(a.withdraw)}</TableCell>
                <TableCell className="text-right">{m(a.fees)}</TableCell>
                <TableCell className={`pr-4 text-right font-semibold ${tone(a.pnl)}`}>
                  {money(a.pnl, currency, { signed: true })}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-foreground/80">
        <span className="tabular-nums">
          {newest.length} positions · page {current + 1} / {pages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
            className="rounded-md border px-3 py-1 enabled:hover:bg-muted disabled:opacity-40"
          >
            Newer
          </button>
          <button
            type="button"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
            className="rounded-md border px-3 py-1 enabled:hover:bg-muted disabled:opacity-40"
          >
            Older
          </button>
        </div>
      </div>
    </Panel>
  );
}
