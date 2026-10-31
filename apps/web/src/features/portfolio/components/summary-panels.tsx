import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import { money, pct, tone } from "../money";
import type { ActivePosition, Currency, Stats } from "../portfolio";

export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <section className={`rounded-lg border bg-card p-4 ${className}`}>{children}</section>;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-[0.9375rem]">
      <dt className="text-foreground/80">{label}</dt>
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
      className={`mt-4 flex h-16 items-center justify-between rounded-md border px-4 ${
        positive ? "border-profit/20 bg-profit/10" : "border-loss/20 bg-loss/10"
      }`}
      style={{
        backgroundImage: "radial-gradient(color-mix(in oklch, currentColor 14%, transparent) 1px, transparent 1px)",
        backgroundSize: "6px 6px",
      }}
    >
      <span className="text-[1.0625rem] font-semibold">{label}</span>
      <span className={`flex items-center gap-3 ${tone(value)}`}>
        <Trend className="size-5" />
        {ratio !== undefined && (
          <span className={`rounded px-2 py-0.5 text-sm tabular-nums ${positive ? "bg-profit/15" : "bg-loss/15"}`}>
            {ratio >= 0 ? "+" : ""}
            {pct(ratio)}
          </span>
        )}
        <span className="text-[1.4375rem] font-bold tabular-nums">{money(value, currency, { signed: true })}</span>
      </span>
    </div>
  );
}

export function sumActive(active: ActivePosition[], currency: Currency) {
  const t = { deposit: 0, withdraw: 0, fees: 0, pnl: 0, balance: 0, unclaimed: 0 };
  for (const p of active) {
    const a = p[currency];
    t.deposit += a.deposit;
    t.withdraw += a.withdraw;
    t.fees += a.fees;
    t.pnl += a.pnl;
    t.balance += a.balance;
    t.unclaimed += a.unclaimed;
  }
  return t;
}

export function ActiveSummary({ active, currency }: { active: ActivePosition[]; currency: Currency }) {
  const t = sumActive(active, currency);
  const pools = new Set(active.map((p) => p.pool)).size;
  const m = (v: number) => money(v, currency);
  return (
    <Panel>
      <h2 className="text-lg font-semibold">Active Positions Summary</h2>
      <p className="mt-1 flex gap-3 text-[0.9375rem] text-foreground/80">
        <span>
          {active.length} position{active.length === 1 ? "" : "s"}
        </span>
        <span className="border-l pl-3">
          {pools} pool{pools === 1 ? "" : "s"}
        </span>
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        <Row label="Total Deposited">{m(t.deposit)}</Row>
        <Row label="Current Position">{m(t.balance)}</Row>
        <Row label="Total Withdrawn">{m(t.withdraw)}</Row>
        <Row label="Pending Fees">{m(t.unclaimed)}</Row>
        <Row label="Claimed Fees">{m(t.fees)}</Row>
        <Row label="Current Position + Pending Fees">{m(t.balance + t.unclaimed)}</Row>
      </dl>
      <div className="mt-4 border-t" />
      <ResultBar label="P&L" value={t.pnl} ratio={t.deposit ? t.pnl / t.deposit : 0} currency={currency} />
    </Panel>
  );
}

export function Performance({
  stats,
  active,
  currency,
}: {
  stats: Stats;
  active: ActivePosition[];
  currency: Currency;
}) {
  const t = sumActive(active, currency);
  const m = (v: number) => money(v, currency);
  return (
    <Panel>
      <h2 className="text-lg font-semibold">Performance</h2>
      <p className="mt-1 flex gap-2 text-[0.9375rem] tabular-nums">
        <span className="text-profit">{stats.wins}W</span>
        <span className="text-muted-foreground">/</span>
        <span className="text-loss">{stats.losses}L</span>
        <span className="border-l pl-3 text-foreground/80">{stats.count} total</span>
      </p>
      <dl className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        <Row label="Total Deposits">{m(stats.deposits)}</Row>
        <Row label="Net Worth">{m(t.balance + t.unclaimed)}</Row>
        <Row label="Total Withdrawals">{m(stats.withdrawals)}</Row>
        <Row label="Avg Invested">{m(stats.avgInvested)}</Row>
        <Row label="Total Fees">{money(stats.fees, currency, { digits: currency === "sol" ? 3 : 2 })}</Row>
        <Row label="Win Rate">
          <span className="text-profit">{stats.count ? pct(stats.wins / stats.count, 1) : "—"}</span>
        </Row>
      </dl>
      <div className="mt-4 border-t" />
      <ResultBar label="Total Profit" value={stats.net} currency={currency} />
    </Panel>
  );
}
