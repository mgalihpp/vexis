import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { InfoTip } from "@/components/info-tip";
import { money, pct, tone } from "../money";
import type { Currency, Stats } from "../portfolio";

function Card({ children }: { children: ReactNode }) {
  return <div className="flex h-[7.5rem] items-center rounded-lg bg-card px-3.25">{children}</div>;
}

function Label({ children, info }: { children: ReactNode; info: string }) {
  return (
    <div className="flex items-center gap-1.25 text-xs text-muted-foreground">
      {children}
      <InfoTip aria-label={info} content={info} contentClassName="max-w-48">
        <InfoIcon className="size-2.75 text-muted-foreground" />
      </InfoTip>
    </div>
  );
}

const Big = ({ className = "", children }: { className?: string; children: ReactNode }) => (
  <div className={`mt-2.5 text-[1.5rem] leading-none font-bold tabular-nums ${className}`}>{children}</div>
);

// Semicircle from 180° to 0°, split into a profit arc and a loss arc with a small gap.
function Gauge({ good, bad }: { good: number; bad: number }) {
  const total = good + bad;
  const share = total ? good / total : 0;
  const r = 46;
  const point = (t: number) => {
    const a = Math.PI * (1 - t);
    return `${50 + r * Math.cos(a)} ${54 - r * Math.sin(a)}`;
  };
  const arc = (from: number, to: number) => `M ${point(from)} A ${r} ${r} 0 0 1 ${point(to)}`;
  const gap = total && share > 0 && share < 1 ? 0.025 : 0;
  return (
    <div className="w-[6rem] shrink-0">
      <svg viewBox="0 0 100 60" className="w-full" aria-hidden="true">
        <path d={arc(0, 1)} className="fill-none stroke-muted" strokeWidth="9" />
        {share > 0 && <path d={arc(0, share - gap)} className="fill-none stroke-profit" strokeWidth="9" />}
        {share < 1 && total > 0 && <path d={arc(share + gap, 1)} className="fill-none stroke-loss" strokeWidth="9" />}
      </svg>
      <div className="-mt-0.75 flex justify-between text-[0.625rem] tabular-nums">
        <span className="text-profit">
          <AnimatedNumber value={good} />
        </span>
        <span className="text-loss">
          <AnimatedNumber value={bad} />
        </span>
      </div>
    </div>
  );
}

function Ring({ good, bad }: { good: number; bad: number }) {
  const total = good + bad;
  const c = 2 * Math.PI * 30;
  const goodLen = total ? (good / total) * c : 0;
  return (
    <svg viewBox="0 0 80 80" className="size-[3.6rem] -rotate-90" aria-hidden="true">
      <circle cx="40" cy="40" r="30" className="fill-none stroke-loss" strokeWidth="9" />
      <circle
        cx="40"
        cy="40"
        r="30"
        className="fill-none stroke-profit"
        strokeWidth="9"
        strokeDasharray={`${goodLen} ${c}`}
      />
    </svg>
  );
}

export function StatCards({ stats, currency }: { stats: Stats; currency: Currency }) {
  const winShare = stats.avgWin + stats.avgLoss ? stats.avgWin / (stats.avgWin + stats.avgLoss) : 0.5;
  const ratio = (value: number | null) =>
    value === null ? "∞" : <AnimatedNumber value={value} format={(v) => v.toFixed(2)} />;
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
      <Card>
        <div className="w-full">
          <div className="flex items-center justify-between">
            <Label info="Realized profit and loss of every closed position in the selected range.">Net P&L</Label>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] tabular-nums text-muted-foreground">
              <AnimatedNumber value={stats.count} />
            </span>
          </div>
          <Big className={tone(stats.net)}>
            <AnimatedNumber value={stats.net} format={(v) => money(v, currency)} />
          </Big>
        </div>
      </Card>

      <Card>
        <div className="flex w-full items-center justify-between gap-1.5">
          <div>
            <Label info="Share of closed positions that ended with a profit.">Position win %</Label>
            <Big>{stats.count ? <AnimatedNumber value={stats.wins / stats.count} format={pct} /> : "—"}</Big>
          </div>
          <Gauge good={stats.wins} bad={stats.losses} />
        </div>
      </Card>

      <Card>
        <div className="flex w-full items-center justify-between gap-1.5">
          <div>
            <Label info="Gross profit divided by gross loss.">Profit factor</Label>
            <Big>{ratio(stats.profitFactor)}</Big>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Ring good={stats.grossProfit} bad={stats.grossLoss} />
            <div className="flex gap-3.25 text-[0.625rem] tabular-nums">
              <span className="text-profit">
                <AnimatedNumber value={stats.grossProfit} format={(v) => money(v, currency)} />
              </span>
              <span className="text-loss">
                <AnimatedNumber value={stats.grossLoss} format={(v) => money(v, currency)} />
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex w-full items-center justify-between gap-1.5">
          <div>
            <Label info="Share of active days whose closed positions added up to a profit.">Day win %</Label>
            <Big>
              {stats.dayWins + stats.dayLosses ? (
                <AnimatedNumber value={stats.dayWins / (stats.dayWins + stats.dayLosses)} format={pct} />
              ) : (
                "—"
              )}
            </Big>
          </div>
          <Gauge good={stats.dayWins} bad={stats.dayLosses} />
        </div>
      </Card>

      <Card>
        <div className="flex w-full items-end gap-2.5">
          <div>
            <Label info="Average winning position divided by average losing position.">Avg win/loss position</Label>
            <Big>{ratio(stats.winLossRatio)}</Big>
          </div>
          <div className="mb-0.5 flex-1">
            <div className="flex h-1.5 overflow-hidden rounded-full">
              <div className="bg-profit" style={{ width: `${winShare * 100}%` }} />
              <div className="flex-1 bg-loss" />
            </div>
            <div className="mt-1.5 flex justify-between gap-1.5 text-[0.625rem] tabular-nums">
              <span className="text-profit">
                <AnimatedNumber value={stats.avgWin} format={(v) => money(v, currency)} />
              </span>
              <span className="text-loss">
                <AnimatedNumber value={-stats.avgLoss} format={(v) => money(v, currency)} />
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
