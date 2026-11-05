import { BotIcon, ShieldIcon, SproutIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Notice } from "@/features/portfolio/components/notice";
import { TokenIcon } from "@/features/portfolio/components/pool-identity";
import { type Agent, type AgentStatus, type BinSide, binLadder, type PoolRef, type StrategyId } from "../agents";

export const STATUS_STYLE: Record<AgentStatus, { label: string; text: string; dot: string; bar: string }> = {
  live: { label: "Live", text: "text-profit", dot: "bg-profit", bar: "bg-profit" },
  paused: { label: "Paused", text: "text-muted-foreground", dot: "bg-muted-foreground", bar: "bg-muted-foreground/60" },
  attention: {
    label: "Attention",
    text: "text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
    bar: "bg-amber-500",
  },
};

export const POSITION_LABEL: Record<Agent["position"], { label: string; text: string }> = {
  "in-range": { label: "In range", text: "text-profit" },
  holding: { label: "Holding", text: "text-foreground" },
  "out-of-range": { label: "Out of range", text: "text-amber-600 dark:text-amber-400" },
};

const STRATEGY_ICON: Record<StrategyId, typeof BotIcon> = {
  "auto-rebalance": BotIcon,
  "range-guard": ShieldIcon,
  "fee-harvester": SproutIcon,
};

export function StrategyIcon({ strategy, className = "" }: { strategy: StrategyId; className?: string }) {
  const Icon = STRATEGY_ICON[strategy];
  return <Icon className={className} />;
}

const AVATAR_TONE: Record<AgentStatus, string> = {
  live: "bg-brand/10 text-brand border-brand/25",
  paused: "bg-muted text-muted-foreground border-border",
  attention: "bg-amber-500/10 text-amber-500 border-amber-500/25",
};

export function AgentAvatar({
  agent,
  className = "size-8",
}: {
  agent: Pick<Agent, "status" | "strategy">;
  className?: string;
}) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg border ${AVATAR_TONE[agent.status]} ${className}`}
    >
      <StrategyIcon strategy={agent.strategy} className="size-4" />
    </span>
  );
}

export function StatusDot({ status, children }: { status: AgentStatus; children?: ReactNode }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[0.65rem] font-medium ${s.text}`}>
      <span className={`size-1.25 rounded-full ${s.dot}`} />
      {children ?? s.label}
    </span>
  );
}

export function PairIcons({ pool, size = "size-4.5" }: { pool: PoolRef; size?: string }) {
  return (
    <span className="flex shrink-0 items-center">
      <TokenIcon token={pool.tokenX} className={`${size} relative z-10 text-[0.5rem] ring-2 ring-card`} />
      <TokenIcon token={pool.tokenY} className={`${size} -ml-1.5 text-[0.5rem]`} />
    </span>
  );
}

const BIN_SIDE: Record<BinSide, string> = {
  y: "bg-foreground/70",
  active: "bg-linear-to-r from-foreground/70 to-brand",
  x: "bg-brand",
};

/** One bar per bin with a tick at the active bin; the same look as the portfolio's position distribution. */
export function RangeBar({ range, className = "" }: { range: Agent["range"]; className?: string }) {
  const { bars, tick } = binLadder(range);
  return (
    <div className={`relative flex h-4.5 ${bars.length <= 60 ? "gap-px" : ""} ${className}`} aria-hidden="true">
      {bars.map((side, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: bars are positional and never reorder
        <div key={i} className={`h-full flex-1 rounded-[0.05rem] ${BIN_SIDE[side]}`} />
      ))}
      {tick !== null && <div className="absolute -top-1.5 bottom-0 w-px bg-foreground" style={{ left: `${tick}%` }} />}
    </div>
  );
}

export function CustodyNote() {
  return <Notice>Agents rebalance and claim fees automatically. Pause one anytime from its card.</Notice>;
}
