import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { solscanTx } from "@/lib/format";
import { compactUsd, money, utcStamp } from "../money";
import {
  type ActivePool,
  type ActivityRow,
  type ActivityValue,
  activityRows,
  type Currency,
  type PositionEvent,
  type Token,
} from "../portfolio";
import { getPositionActivity } from "../portfolio.functions";
import { SolscanLink, TokenIcon } from "./pool-identity";

const route = getRouteApi("/portfolio/$wallet");

/** What the activity lines need from a pool; a closed pool has no FDV. */
export type ActivityPool = Pick<ActivePool, "tokenX" | "tokenY" | "fdv">;

export type Activity =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; events: PositionEvent[] };

/** Fetches a position's history once `enabled` turns on. */
export function useActivity(position: string, enabled: boolean): Activity {
  const [state, setState] = useState<Activity>({ status: "idle" });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    setState({ status: "loading" });
    getPositionActivity({ data: { position } }).then(
      (events) => {
        if (live) setState({ status: "ready", events });
      },
      (e: unknown) => {
        if (live) setState({ status: "error", message: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      live = false;
    };
  }, [position, enabled]);
  return state;
}

const EVENTS: Record<string, { label: string; className: string }> = {
  initialize: { label: "Initialized Position", className: "bg-blue-500/12.5 text-blue-500" },
  add: { label: "Added Liquidity", className: "bg-profit/15 text-profit" },
  remove: { label: "Removed Liquidity", className: "bg-loss/15 text-loss" },
  claim_fee: { label: "Claimed Fees", className: "bg-brand/15 text-brand" },
  close: { label: "Closed Position", className: "bg-muted text-foreground/80" },
};

const eventKind = (type: string) =>
  EVENTS[type] ?? { label: type.replace(/_/g, " "), className: "bg-muted text-foreground/80 capitalize" };

export function EventBadge({ type, href }: { type: string; href: string }) {
  const kind = eventKind(type);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-block rounded px-1 py-0.5 whitespace-nowrap ${kind.className}`}
    >
      {kind.label}
    </a>
  );
}

export function FdvChip({ row, pool }: { row: Pick<ActivityRow, "fdv">; pool: ActivityPool }) {
  if (row.fdv === null) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-sm border bg-foreground/5 px-1.5 py-0.5 text-[0.625rem] font-semibold text-muted-foreground tabular-nums">
      <TokenIcon token={pool.tokenX} className="size-3 text-[0.4rem]" />
      {compactUsd(row.fdv)}
    </span>
  );
}

const tokenAmount = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });

export const value = (v: number | null, currency: Currency) => (v === null ? "—" : money(v, currency));

function TokenLine({ token, side, currency }: { token: Token; side: ActivityValue; currency: Currency }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
      <TokenIcon token={token} className="size-4 text-[0.45rem]" />
      <span className="text-muted-foreground">{tokenAmount.format(side.amount)}</span>
      <span className="font-medium">{token.symbol}</span>
      <span className="text-muted-foreground">({value(side[currency], currency)})</span>
    </span>
  );
}

export function TokenLines({
  row,
  pool,
  currency,
}: {
  row: Pick<ActivityRow, "x" | "y">;
  pool: ActivityPool;
  currency: Currency;
}) {
  return (
    <>
      {row.x.amount > 0 && <TokenLine token={pool.tokenX} side={row.x} currency={currency} />}
      {row.y.amount > 0 && <TokenLine token={pool.tokenY} side={row.y} currency={currency} />}
    </>
  );
}

/** Table layout: one line per event. Cards layout: the detail dialog's stacked cards. */
export function ActivityList({
  activity,
  pool,
  currency,
  layout,
}: {
  activity: Activity;
  pool: ActivityPool;
  currency: Currency;
  layout: "lines" | "cards";
}) {
  const solPrice = route.useLoaderData({ select: (p) => p.solPrice });
  if (activity.status === "error") return <p className="p-2.5 text-xs text-loss">{activity.message}</p>;
  if (activity.status !== "ready") return <p className="p-2.5 text-xs text-muted-foreground">Loading activity…</p>;
  const rows = activityRows(activity.events, pool, solPrice);
  if (rows.length === 0) return <p className="p-2.5 text-xs text-muted-foreground">No activity.</p>;
  if (layout === "lines") {
    return (
      <ul className="text-xs">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-3 border-b py-1 pr-2 pl-20">
            <span className="flex w-6 shrink-0 justify-center">
              <SolscanLink href={solscanTx(row.signature)} label="Transaction on Solscan" />
            </span>
            <span className="w-30 shrink-0">
              <EventBadge type={row.type} href={solscanTx(row.signature)} />
            </span>
            <span className="w-37.5 shrink-0 text-muted-foreground tabular-nums">{utcStamp(row.at)}</span>
            <span className="w-16 shrink-0">
              <FdvChip row={row} pool={pool} />
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1">
              <TokenLines row={row} pool={pool} currency={currency} />
            </span>
            <span className="shrink-0 font-semibold tabular-nums">{value(row.total[currency], currency)}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="space-y-1.5 text-[0.65rem]">
      {rows.map((row) => (
        <li key={row.id} className="rounded-md border p-2.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="flex items-center gap-1.5">
              <SolscanLink href={solscanTx(row.signature)} label="Transaction on Solscan" />
              <EventBadge type={row.type} href={solscanTx(row.signature)} />
            </span>
            <span className="font-semibold tabular-nums">{value(row.total[currency], currency)}</span>
          </div>
          <div className="mt-1.25 flex items-center justify-between gap-1.5">
            <span className="text-foreground/80 tabular-nums">{utcStamp(row.at)}</span>
            <FdvChip row={row} pool={pool} />
          </div>
          <div className="mt-1.25 flex flex-col gap-0.75">
            <TokenLines row={row} pool={pool} currency={currency} />
          </div>
        </li>
      ))}
    </ul>
  );
}
