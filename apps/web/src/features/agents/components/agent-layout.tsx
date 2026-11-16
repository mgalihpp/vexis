// Layout pieces the agent pages share, in the portfolio page's style: a slim top bar, flat stat cards and
// shadcn tables with sortable headers.

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TokenIcon } from "@/features/portfolio/components/pool-identity";
import { type Sort, SortHead } from "@/features/portfolio/components/table-controls";
import { timeAgo } from "@/features/portfolio/money";
import { useStamp } from "@/features/timezone/timezone";
import { shortAddr } from "@/lib/format";
import { type AlertView, compactUsd, type PairTokens, ratioText } from "../agents";

/** The bar under the header: what this page is on the left, its actions on the right. */
export function AgentsBar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2.5 border-b px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-1.5 text-xs">{children}</div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
  );
}

/** A pill like the wallet picker's, for the page or crumb the bar names. */
export function BarPill({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex h-7 min-w-0 items-center gap-2 rounded-md bg-card px-2 font-medium">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function StatCard({ label, value, tone = "" }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="flex h-[6rem] flex-col justify-center rounded-lg bg-card px-3.25">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-2.5 truncate text-[1.5rem] leading-none font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  );
}

const STAT_TONE = {
  brand: { card: "from-brand/10", icon: "bg-brand/15 text-brand", bar: "bg-brand" },
  sky: { card: "from-sky-500/10", icon: "bg-sky-500/15 text-sky-500", bar: "bg-sky-500" },
  violet: { card: "from-violet-500/10", icon: "bg-violet-500/15 text-violet-500", bar: "bg-violet-500" },
  amber: { card: "from-amber-500/10", icon: "bg-amber-500/15 text-amber-500", bar: "bg-amber-500" },
};

export type Tone = keyof typeof STAT_TONE;

export function KpiCard({
  icon,
  tone,
  label,
  value,
  hint,
  visual,
}: {
  icon: ReactNode;
  tone: Tone;
  label: string;
  value: ReactNode;
  hint: string;
  visual: ReactNode;
}) {
  const t = STAT_TONE[tone];
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border bg-linear-to-br ${t.card} to-card to-60% bg-card px-4 py-5`}
    >
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${t.icon}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-1 truncate text-2xl leading-tight font-bold tabular-nums">{value}</div>
        <div className="mt-0.5 truncate text-[0.7rem] text-muted-foreground">{hint}</div>
      </div>
      <div className="shrink-0">{visual}</div>
    </div>
  );
}

/** Share of agents running, as a ring. */
const RING_STROKE: Record<Tone, string> = {
  brand: "stroke-brand",
  sky: "stroke-sky-500",
  violet: "stroke-violet-500",
  amber: "stroke-amber-500",
};

export function Ring({ value, tone = "brand" }: { value: number; tone?: Tone }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="size-11 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="3.5" className="stroke-muted" />
      {value > 0 && (
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={`${c * value} ${c}`}
          className={RING_STROKE[tone]}
        />
      )}
    </svg>
  );
}

/** Bars scaled to the largest, at most `max` of them; none for fewer than two, which compare nothing. */
export function MiniBars({ values, tone, max: most = 8 }: { values: number[]; tone: Tone; max?: number }) {
  const shown = values.slice(-most);
  if (shown.length < 2) return null;
  const max = Math.max(1, ...shown);
  return (
    <div className={`flex h-11 items-end ${shown.length > 8 ? "gap-0.5" : "gap-1"}`} aria-hidden>
      {shown.map((v, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: bars follow the agent order
          key={i}
          className={`${shown.length > 8 ? "w-1" : "w-1.5"} rounded-full ${v ? STAT_TONE[tone].bar : "bg-muted"}`}
          style={{ height: `${Math.max(12, (v / max) * 100)}%`, opacity: v ? 0.4 + 0.6 * (v / max) : 1 }}
        />
      ))}
    </div>
  );
}

export function Panel({
  title,
  action,
  className = "",
  children,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-lg bg-card ${className}`}>
      <header className="flex min-h-11 items-center justify-between gap-3 px-3.25 py-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

/** The two token logos of a pool, overlapped; a letter stands in when they could not be looked up. */
export function PairLogo({ tokens, name, size = "md" }: { tokens: PairTokens; name: string; size?: "sm" | "md" }) {
  const box = size === "sm" ? "size-4 text-[0.55rem]" : "size-7 text-xs";
  const overlap = size === "sm" ? "-ml-1.5" : "-ml-2.5";
  if (!tokens)
    return (
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold ${box}`}>
        {name.slice(0, 1)}
      </span>
    );
  return (
    <span className="flex shrink-0 items-center">
      <TokenIcon token={tokens[0]} className={`relative z-10 ${box}`} />
      <TokenIcon token={tokens[1]} className={`${overlap} ${box}`} />
    </span>
  );
}

/** Pair logos, the pool's name linking to its analytics, and its short address. */
export function PoolCell({ address, label, tokens }: { address: string; label: string | null; tokens: PairTokens }) {
  const name = label ?? shortAddr(address);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PairLogo tokens={tokens} name={name} />
      <div className="min-w-0">
        <Link
          to="/analytics"
          search={{ pool: address }}
          className="block truncate text-xs font-semibold hover:text-brand"
        >
          {name}
        </Link>
        <div className="font-mono text-[0.625rem] text-muted-foreground">{shortAddr(address)}</div>
      </div>
    </div>
  );
}

export type AlertSortKey = "at" | "vol1m" | "baseline" | "ratio";

export const ALERT_SORTS = {
  at: (a: AlertView) => a.at,
  vol1m: (a: AlertView) => a.vol1m,
  baseline: (a: AlertView) => a.baseline,
  ratio: (a: AlertView) => a.ratio,
} satisfies Record<AlertSortKey, (a: AlertView) => number>;

const ALERT_COLUMNS = 6;

/** Alerts as table rows. With `sort` the number columns sort; without it they are plain headers. */
export function AlertsTable({
  alerts,
  now,
  empty,
  sort,
  onSort,
}: {
  alerts: AlertView[];
  now: number;
  empty: string;
  sort?: Sort<AlertSortKey>;
  onSort?: (sort: Sort<AlertSortKey>) => void;
}) {
  const stamp = useStamp();
  const head = (id: AlertSortKey, label: string, className: string) =>
    sort && onSort ? (
      <SortHead id={id} sort={sort} onSort={onSort} className={className}>
        {label}
      </SortHead>
    ) : (
      <TableHead className={className}>{label}</TableHead>
    );
  return (
    <Table className="min-w-[44rem]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-3.25">Pool</TableHead>
          {head("at", "Time", "text-right")}
          {head("vol1m", "Volume 1m", "text-right")}
          {head("baseline", "Median", "text-right")}
          {head("ratio", "Spike", "text-right")}
          <TableHead className="pr-3.25 text-right">Telegram</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {alerts.length === 0 && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={ALERT_COLUMNS} className="py-10 text-center text-muted-foreground">
              {empty}
            </TableCell>
          </TableRow>
        )}
        {alerts.map((a) => (
          <TableRow key={a.id}>
            <TableCell className="pl-3.25">
              <PoolCell address={a.poolAddress} label={a.poolLabel} tokens={a.tokens} />
            </TableCell>
            <TableCell className="text-right">
              <div className="text-muted-foreground">{stamp(a.at, " at ")}</div>
              <div className="font-semibold">{timeAgo(a.at, now)}</div>
            </TableCell>
            <TableCell className="text-right font-medium">{compactUsd(a.vol1m)}</TableCell>
            <TableCell className="text-right text-muted-foreground">{compactUsd(a.baseline)}</TableCell>
            <TableCell className="text-right font-semibold text-brand">{ratioText(a.ratio)}</TableCell>
            <TableCell className="pr-3.25 text-right">
              <Delivery alert={a} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function Delivery({ alert: a }: { alert: Pick<AlertView, "delivered" | "error"> }) {
  if (a.delivered) return <span className="rounded bg-profit/15 px-1.5 py-0.5 text-[0.625rem] text-profit">Sent</span>;
  return (
    <span className="rounded bg-loss/15 px-1.5 py-0.5 text-[0.625rem] text-loss" title={a.error ?? undefined}>
      {a.error ? "Not sent" : "Sending"}
    </span>
  );
}
