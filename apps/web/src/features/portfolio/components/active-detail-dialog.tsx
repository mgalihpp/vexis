import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { shortAddr, solscanAccount } from "@/lib/format";
import { type ActivePool, type ActivePosition, type Currency, poolTotals } from "../portfolio";
import { Age, Deposits, Fees, Offsets, Pnl, RangePill, ShareButton, Tile, Withdrawals } from "./active-figures";
import type { ShareTarget } from "./active-share";
import { PoolIdentity, SolscanLink } from "./pool-identity";
import { ActivityList, useActivity } from "./position-activity";
import { Distribution } from "./position-distribution";

export function ActiveDetailDialog({
  pool,
  open,
  onOpenChange,
  currency,
  onShare,
}: {
  pool: ActivePool | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: Currency;
  onShare: (target: ShareTarget) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-[min(52rem,calc(100vw-1.6rem))] gap-0 overflow-y-auto p-0 sm:max-w-[52rem]">
        {pool && (
          <>
            <div className="border-b p-3.25 pr-8">
              <DialogTitle className="sr-only">{pool.pair}</DialogTitle>
              <PoolIdentity pool={pool} />
            </div>
            <div className="space-y-2.5 p-3.25">
              {pool.positions.map((position, i) => (
                <PositionSection
                  key={position.address}
                  pool={pool}
                  position={position}
                  n={i + 1}
                  currency={currency}
                  onShare={onShare}
                />
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PositionSection({
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
  const positions = [position];
  const t = poolTotals(positions, currency);
  const [expanded, setExpanded] = useState(false);
  // Fetched on first expand and kept while the dialog is open.
  const [requested, setRequested] = useState(false);
  const activity = useActivity(position.address, requested);
  return (
    <section className="rounded-lg border">
      <header className="flex flex-wrap items-center gap-1.5 px-2.5 pt-2.5">
        <SolscanLink href={solscanAccount(position.address)} label={`Position #${n} on Solscan`} />
        <span className="font-semibold">Position #{n}</span>
        <RangePill positions={positions} />
        <Offsets pool={pool} positions={positions} />
        <a
          href={solscanAccount(position.address)}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-[0.65rem] text-muted-foreground hover:text-brand"
        >
          {shortAddr(position.address)}
        </a>
      </header>
      <div className="grid gap-1.5 p-2.5 sm:grid-cols-3">
        <Tile label="Distribution">
          <Distribution pool={pool} positions={positions} className="w-full" />
        </Tile>
        <Tile label="Age" className="text-right">
          <Age positions={positions} />
        </Tile>
        <Tile label="PnL" className="text-right" action={<ShareButton onClick={() => onShare({ pool, positions })} />}>
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
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(!expanded);
          setRequested(true);
        }}
        className="flex w-full items-center justify-between border-t px-2.5 py-2 font-semibold hover:bg-muted/40"
      >
        Position Activities
        <span className="flex items-center gap-1.5 text-[0.65rem] font-normal text-muted-foreground tabular-nums">
          {activity.status === "ready" && activity.events.length}
          <ChevronDownIcon className={`size-3.25 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </span>
      </button>
      {expanded && (
        <div className="max-h-[22.4rem] overflow-y-auto px-2.5 pb-2.5">
          <ActivityList activity={activity} pool={pool} currency={currency} layout="cards" />
        </div>
      )}
    </section>
  );
}
