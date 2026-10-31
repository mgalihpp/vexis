import { createFileRoute } from "@tanstack/react-router";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel } from "@/features/portfolio/components/summary-panels";
import { money, pct, tone } from "@/features/portfolio/money";
import { usePortfolioView } from "@/features/portfolio/use-portfolio-view";
import { shortAddr } from "@/lib/format";

export const Route = createFileRoute("/portfolio/$wallet/active")({
  component: ActivePositions,
});

function ActivePositions() {
  const { active, currency } = usePortfolioView();
  const m = (v: number) => money(v, currency);
  return (
    <Panel className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Pair</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Bins</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Deposited</TableHead>
            <TableHead className="text-right">Withdrawn</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">Pending fees</TableHead>
            <TableHead className="pr-4 text-right">P&L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="tabular-nums">
          {active.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                No active positions.
              </TableCell>
            </TableRow>
          )}
          {active.map((p) => {
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
                <TableCell>
                  {p.lowerBin} – {p.upperBin}
                </TableCell>
                <TableCell>
                  {p.inRange === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : p.inRange ? (
                    <span className="text-profit">In range</span>
                  ) : (
                    <span className="text-loss">Out of range</span>
                  )}
                </TableCell>
                <TableCell className="text-right">{m(a.deposit)}</TableCell>
                <TableCell className="text-right">{m(a.withdraw)}</TableCell>
                <TableCell className="text-right">{m(a.balance)}</TableCell>
                <TableCell className="text-right">{m(a.unclaimed)}</TableCell>
                <TableCell className={`pr-4 text-right font-semibold ${tone(a.pnl)}`}>
                  {money(a.pnl, currency, { signed: true })}
                  {a.deposit > 0 && <span className="ml-1.5 text-xs font-normal">({pct(a.pnl / a.deposit)})</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Panel>
  );
}
