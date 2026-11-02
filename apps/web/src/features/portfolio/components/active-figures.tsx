import { CircleCheckIcon, CircleXIcon, ShareIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { useNow } from "@/hooks/use-now";
import { compactUsd, duration, money, pct, tone, utcStamp } from "../money";
import {
  type ActiveAmounts,
  type ActivePool,
  type ActivePosition,
  type Amounts,
  binSpan,
  type Currency,
  openedAt,
  rangeOffsets,
} from "../portfolio";
import { usePortfolio } from "../use-portfolio-view";

export function Tile({
  label,
  action,
  className = "",
  children,
}: {
  label: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-md border bg-background/90 p-3 text-xs ${className}`}>
      <div className="mb-1 flex min-h-4.5 items-center justify-between gap-2">
        <span className="text-[0.6875rem] font-medium tracking-[0.025em] text-muted-foreground uppercase">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ShareButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Share PnL"
      onClick={onClick}
      className="rounded p-0.75 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <ShareIcon className="size-4" />
    </button>
  );
}

const signedPct = (ratio: number) => `${ratio > 0 ? "+" : ""}${pct(ratio)}`;

export const pnlRatio = (t: Amounts) => (t.deposit ? t.pnl / t.deposit : 0);

export function Pnl({ totals, currency }: { totals: Amounts; currency: Currency }) {
  return (
    <div className={`font-medium tabular-nums ${tone(totals.pnl)}`}>
      <div>
        <AnimatedNumber value={pnlRatio(totals)} format={signedPct} />
      </div>
      <div>
        <AnimatedNumber value={totals.pnl} format={(v) => money(v, currency, { signed: true })} />
      </div>
    </div>
  );
}

export function Deposits({ totals, currency }: { totals: ActiveAmounts; currency: Currency }) {
  return (
    <div className="tabular-nums">
      <div className="text-muted-foreground">
        Total: <AnimatedNumber value={totals.deposit} format={(v) => money(v, currency)} />
      </div>
      <div className="font-semibold">
        <AnimatedNumber value={totals.balance} format={(v) => money(v, currency)} />
      </div>
    </div>
  );
}

export function Withdrawals({ totals, currency }: { totals: ActiveAmounts; currency: Currency }) {
  return (
    <div className="tabular-nums text-foreground/80">
      <AnimatedNumber value={totals.withdraw} format={(v) => money(v, currency)} />
    </div>
  );
}

export function Fees({ totals, currency }: { totals: ActiveAmounts; currency: Currency }) {
  return (
    <div className="tabular-nums">
      <div className="text-muted-foreground">
        Claimed: <AnimatedNumber value={totals.fees} format={(v) => money(v, currency)} />
      </div>
      <div className="font-semibold">
        <AnimatedNumber value={totals.unclaimed} format={(v) => money(v, currency)} />
      </div>
    </div>
  );
}

/** Time since `since`, ticking every second once hydrated. */
export function LiveDuration({ since }: { since: number }) {
  const fetchedAt = usePortfolio().fetchedAt;
  return <>{duration(useNow(fetchedAt) - since)}</>;
}

export function Age({ positions }: { positions: ActivePosition[] }) {
  const opened = openedAt(positions);
  if (opened === null) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="tabular-nums">
      <div className="text-foreground/80">{utcStamp(opened, " at ")}</div>
      <div className="font-semibold">
        <LiveDuration since={opened} />
      </div>
    </div>
  );
}

export function RangePill({ positions }: { positions: ActivePosition[] }) {
  const inside = positions.filter((p) => p.inRange === true).length;
  const outside = positions.filter((p) => p.inRange === false).length;
  if (inside + outside === 0) return null;
  const [text, className, Icon] =
    outside === 0
      ? ["In Range", "bg-profit/15 text-profit", CircleCheckIcon]
      : inside === 0
        ? ["Out of Range", "bg-loss/15 text-loss", CircleXIcon]
        : [`${inside}/${positions.length} In Range`, "bg-brand/15 text-brand", CircleCheckIcon];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium whitespace-nowrap ${className}`}
    >
      <Icon className="size-3" />
      {text}
    </span>
  );
}

const wholePct = (ratio: number) => `${ratio < 0 ? "-" : "+"}${Math.abs(Math.round(ratio * 100))}%`;

/** `-0% / +1%`: the range edges relative to the current price. */
export function Offsets({ pool, positions }: { pool: ActivePool; positions: ActivePosition[] }) {
  const range = binSpan(positions);
  if (!range || !pool.price) return null;
  const { lower, upper } = rangeOffsets(range, pool.price);
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      {wholePct(lower)} / {wholePct(upper)}
    </span>
  );
}

export function RangeStatus({ pool, positions }: { pool: ActivePool; positions: ActivePosition[] }) {
  return (
    <div className="flex flex-col items-center gap-0.75">
      <span className="font-semibold tabular-nums">
        <AnimatedNumber value={positions.length} />
      </span>
      <RangePill positions={positions} />
      <Offsets pool={pool} positions={positions} />
    </div>
  );
}

export function FdvTvl({ pool }: { pool: ActivePool }) {
  return (
    <div className="text-[0.625rem] whitespace-nowrap tabular-nums">
      <div>
        <span className="text-muted-foreground">FDV: </span>
        {pool.fdv === null ? "—" : <AnimatedNumber value={pool.fdv} format={compactUsd} />}
      </div>
      <div>
        <span className="text-muted-foreground">TVL: </span>
        {pool.tvl === null ? "—" : <AnimatedNumber value={pool.tvl} format={compactUsd} />}
      </div>
    </div>
  );
}
