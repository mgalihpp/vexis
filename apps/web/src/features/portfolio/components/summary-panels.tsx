import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import { money, pct, tone } from "../money";
import { type ActivePool, type Currency, poolTotals, type Stats } from "../portfolio";

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-lg bg-card p-3.25 ${className}`}>{children}</section>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-2.5 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{children}</dd>
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
      className={`mt-3.25 flex h-13 items-center justify-between rounded-md px-3 ${
        positive ? "border-profit/20 bg-profit/10" : "border-loss/20 bg-loss/10"
      }`}
      style={{
        backgroundImage: "radial-gradient(color-mix(in oklch, currentColor 14%, transparent) 1px, transparent 1px)",
        backgroundSize: "6px 6px",
      }}
    >
      <span className="text-[0.85rem] font-semibold">{label}</span>
      <span className={`flex items-center gap-2.5 ${tone(value)}`}>
        <Trend className="size-4" />
        {ratio !== undefined && (
          <span className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${positive ? "bg-profit/15" : "bg-loss/15"}`}>
            {ratio >= 0 ? "+" : ""}
            {pct(ratio)}
          </span>
        )}
        <span className="text-[1.15rem] font-bold tabular-nums">{money(value, currency, { signed: true })}</span>
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
          {positions.length} position{positions.length === 1 ? "" : "s"}
        </span>
        <span className="border-l pl-2.5">
          {pools} pool{pools === 1 ? "" : "s"}
        </span>
      </p>
      <dl className="mt-3.25 grid gap-x-4.75 gap-y-2 sm:grid-cols-2">
        <Row label="Total Deposited">{m(t.deposit)}</Row>
        <Row label="Current Position">{m(t.balance)}</Row>
        <Row label="Total Withdrawn">{m(t.withdraw)}</Row>
        <Row label="Pending Fees">{m(t.unclaimed)}</Row>
        <Row label="Claimed Fees">{m(t.fees)}</Row>
        <Row label="Current Position + Pending Fees">{m(t.balance + t.unclaimed)}</Row>
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
        <span className="text-profit">{stats.wins}W</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-loss">{stats.losses}L</span>
        <span className="border-l pl-2.5 text-muted-foreground">{stats.count} total</span>
      </p>
      <dl className="mt-3.25 grid gap-x-4.75 gap-y-2 sm:grid-cols-2">
        <Row label="Total Deposits">{m(stats.deposits)}</Row>
        <Row label="Net Worth">{m(t.balance + t.unclaimed)}</Row>
        <Row label="Total Withdrawals">{m(stats.withdrawals)}</Row>
        <Row label="Avg Invested">{m(stats.avgInvested)}</Row>
        <Row label="Total Fees">{money(stats.fees, currency, { digits: currency === "sol" ? 3 : 2 })}</Row>
        <Row label="Win Rate">
          <span className="text-profit">{stats.count ? pct(stats.wins / stats.count, 1) : "—"}</span>
        </Row>
      </dl>
      <div className="mt-3.25 border-t" />
      <ResultBar label="Total Profit" value={stats.net} currency={currency} />
    </Panel>
  );
}
