import type { ReactNode } from "react";
import { money, pct, tone } from "../money";
import type { Amounts, Currency, PoolMeta } from "../portfolio";
import { pnlRatio } from "./active-figures";
import { PoolBadges } from "./pool-identity";

const label = "text-xs font-medium tracking-[0.05em] text-muted-foreground uppercase";

/** The body of a pool's PnL share card, shared by active and closed positions. */
export function PnlShareCard({
  pool,
  status,
  duration,
  totals,
  currency,
  details,
  aside,
}: {
  pool: PoolMeta;
  status: "Active" | "Closed";
  duration: ReactNode;
  totals: Amounts;
  currency: Currency;
  details: [name: string, value: ReactNode][];
  aside?: ReactNode;
}) {
  return (
    <div className="mt-5 grid grid-cols-[1fr_14.25rem] gap-8">
      <div>
        <div data-share-item>
          <p className={label}>Duration</p>
          <p className="mt-1 text-xl font-bold uppercase tabular-nums">{duration}</p>
        </div>
        <div data-share-item className="mt-4">
          <PoolBadges pool={pool} />
        </div>
        <h3 data-share-item className="mt-3 text-4xl leading-none font-bold">
          {pool.pair}
        </h3>
        <div data-share-item className="mt-5">
          <p className="flex items-center gap-2">
            <span className={label}>PnL</span>
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${tone(totals.pnl)} ${totals.pnl < 0 ? "bg-loss/15" : "bg-profit/15"}`}
            >
              {totals.pnl > 0 ? "+" : ""}
              {pct(pnlRatio(totals))}
            </span>
          </p>
          <p className={`mt-1 text-4xl leading-tight font-bold tabular-nums ${tone(totals.pnl)}`}>
            {money(totals.pnl, currency, { signed: true })}
          </p>
        </div>
        <span
          data-share-item
          className="mt-6 inline-block rounded bg-muted px-3 py-1 text-xs font-bold tracking-wide uppercase"
        >
          {status}
        </span>
      </div>
      <div>
        <p className={`${label} mb-1`}>Details</p>
        <dl>
          {details.map(([name, value]) => (
            <div key={name} data-share-item className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="text-[0.625rem] font-medium tracking-[0.05em] text-muted-foreground uppercase">{name}</dt>
              <dd className="text-sm font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {aside && (
          <div data-share-item className="mt-5">
            {aside}
          </div>
        )}
      </div>
    </div>
  );
}
