import { money } from "../money";
import { type ActivePool, type ActivePosition, type Currency, openedAt, poolTotals } from "../portfolio";
import { LiveDuration } from "./active-figures";
import { PnlShareCard } from "./pnl-share-card";
import { Distribution } from "./position-distribution";
import { ShareDialog } from "./share-dialog";

export interface ShareTarget {
  pool: ActivePool;
  positions: ActivePosition[];
}

// No token icons here: html-to-image cannot read cross-origin images into the canvas.
export function ActiveShare({
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
  const t = target && poolTotals(target.positions, currency);
  const opened = target && openedAt(target.positions);
  const m = (v: number) => money(v, currency);
  return (
    <ShareDialog
      open={open}
      onOpenChange={onOpenChange}
      hint="Click any card section to hide or restore it"
      title={`${target?.pool.pair ?? "Active"} position`}
    >
      {target && t && (
        <PnlShareCard
          pool={target.pool}
          status="Active"
          duration={opened !== null && <LiveDuration since={opened} />}
          totals={t}
          currency={currency}
          details={[
            ["Positions", target.positions.length],
            ["Total deposits", m(t.deposit)],
            ["Current deposits", m(t.balance)],
            ["Withdrawals", m(t.withdraw)],
            ["Fees", m(t.fees + t.unclaimed)],
          ]}
          aside={<Distribution pool={target.pool} positions={target.positions} className="w-full" />}
        />
      )}
    </ShareDialog>
  );
}
