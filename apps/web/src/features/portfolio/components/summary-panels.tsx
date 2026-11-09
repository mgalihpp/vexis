import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { money, pct, tone } from "../money";
import { type ActivePool, type Currency, poolTotals, type Stats } from "../portfolio";

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-lg bg-card p-3.25 ${className}`}>{children}</section>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs sm:flex-row sm:justify-between sm:gap-2.5">
      <dt className="text-[0.65rem] text-muted-foreground sm:text-xs">{label}</dt>
      <dd className="font-medium tabular-nums sm:text-right">{children}</dd>
    </div>
  );
}

// Dotted texture over a green or red wash, like a ticket stub.
function ResultBar({
  label,
  value,
  ratio,
  currency,
}: {
  label: string;
  value: number;
  ratio?: number;
  currency: Currency;
}) {
  const positive = value >= 0;
  const Trend = positive ? TrendingUpIcon : TrendingDownIcon;
  return (
    <div
      className={`mt-3.25 flex h-11 items-center justify-between gap-2 rounded-md px-2.5 sm:h-13 sm:px-3 ${
        positive ? "border-profit/20 bg-profit/10" : "border-loss/20 bg-loss/10"
      }`}
      style={{
        backgroundImage: "radial-gradient(color-mix(in oklch, currentColor 14%, transparent) 1px, transparent 1px)",
        backgroundSize: "6px 6px",
      }}
    >
      <span className="text-xs font-semibold whitespace-nowrap sm:text-[0.85rem]">{label}</span>
      <span className={`flex items-center gap-1.5 sm:gap-2.5 ${tone(value)}`}>
        <Trend className="size-3.5 sm:size-4" />
        {ratio !== undefined && (
          <span className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${positive ? "bg-profit/15" : "bg-loss/15"}`}>
            {ratio >= 0 ? "+" : ""}
            <AnimatedNumber value={ratio} format={pct} />
          </span>
        )}
        <span className="text-sm font-bold whitespace-nowrap tabular-nums sm:text-[1.15rem]">
          <AnimatedNumber value={value} format={(v) => money(v, currency, { signed: true })} />
        </span>
      </span>
    </div>
  );
}

export function ActiveSummary({ active, currency }: { active: ActivePool[]; currency: Currency }) {
  const positions = active.flatMap((p) => p.positions);
  const t = poolTotals(positions, currency);
  const pools = active.length;
  const m = (v: number) => money(v, currency);
  return (
    <Panel>
      <h2 className="text-sm font-medium">Active Positions Summary</h2>
      <p className="mt-0.75 flex gap-2.5 text-xs text-muted-foreground">
        <span>
          <AnimatedNumber value={positions.length} /> position{positions.length === 1 ? "" : "s"}
        </span>
        <span className="border-l pl-2.5">
          <AnimatedNumber value={pools} /> pool{pools === 1 ? "" : "s"}
        </span>
      </p>
      <dl className="mt-3.25 grid grid-cols-2 gap-x-3 gap-y-2.5 sm:gap-x-4.75 sm:gap-y-2">
        <Row label="Total Deposited">
          <AnimatedNumber value={t.deposit} format={m} />
        </Row>
        <Row label="Current Position">
          <AnimatedNumber value={t.balance} format={m} />
        </Row>
        <Row label="Total Withdrawn">
          <AnimatedNumber value={t.withdraw} format={m} />
        </Row>
        <Row label="Pending Fees">
          <AnimatedNumber value={t.unclaimed} format={m} />
        </Row>
        <Row label="Claimed Fees">
          <AnimatedNumber value={t.fees} format={m} />
        </Row>
        <Row label="Current Position + Pending Fees">
          <AnimatedNumber value={t.balance + t.unclaimed} format={m} />
        </Row>
      </dl>
      <div className="mt-3.25 border-t" />
      <ResultBar label="P&L" value={t.pnl} ratio={t.deposit ? t.pnl / t.deposit : 0} currency={currency} />
    </Panel>
  );
}

export function Performance({ stats, active, currency }: { stats: Stats; active: ActivePool[]; currency: Currency }) {
  const t = poolTotals(
    active.flatMap((p) => p.positions),
    currency,
  );
  const m = (v: number) => money(v, currency);
  return (
    <Panel>
      <h2 className="text-sm font-medium">Performance</h2>
      <p className="mt-0.75 flex gap-1.5 text-xs tabular-nums">
        <span className="text-profit">
          <AnimatedNumber value={stats.wins} />W
        </span>
        <span className="text-muted-foreground">/</span>
        <span className="text-loss">
          <AnimatedNumber value={stats.losses} />L
        </span>
        <span className="border-l pl-2.5 text-muted-foreground">
          <AnimatedNumber value={stats.count} /> total
        </span>
      </p>
      <dl className="mt-3.25 grid grid-cols-2 gap-x-3 gap-y-2.5 sm:gap-x-4.75 sm:gap-y-2">
        <Row label="Total Deposits">
          <AnimatedNumber value={stats.deposits} format={m} />
        </Row>
        <Row label="Net Worth">
          <AnimatedNumber value={t.balance + t.unclaimed} format={m} />
        </Row>
        <Row label="Total Withdrawals">
          <AnimatedNumber value={stats.withdrawals} format={m} />
        </Row>
        <Row label="Avg Invested">
          <AnimatedNumber value={stats.avgInvested} format={m} />
        </Row>
        <Row label="Total Fees">
          <AnimatedNumber
            value={stats.fees}
            format={(v) => money(v, currency, { digits: currency === "sol" ? 3 : 2 })}
          />
        </Row>
        <Row label="Win Rate">
          <span className="text-profit">
            {stats.count ? <AnimatedNumber value={stats.wins / stats.count} format={(v) => pct(v, 1)} /> : "—"}
          </span>
        </Row>
      </dl>
      <div className="mt-3.25 border-t" />
      <ResultBar label="Total Profit" value={stats.net} currency={currency} />
    </Panel>
  );
}
