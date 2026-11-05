import { Link, useNavigate } from "@tanstack/react-router";
import {
  ActivityIcon,
  ChevronRightIcon,
  ClockIcon,
  ExternalLinkIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  Settings2Icon,
  ShieldCheckIcon,
  TrashIcon,
  ZapIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { money, tone } from "@/features/portfolio/money";
import { useAgents } from "@/stores/agents";
import { type Agent, formatBin, pnlSeries, strategyLabel } from "../agents";
import { PairIcons, POSITION_LABEL, RangeBar, StatusDot } from "./agent-ui";

const usd = (v: number) => money(v, "usd");
const signedUsd = (v: number) => money(v, "usd", { signed: true });

export const DETAIL_TABS = ["overview", "positions", "rules", "activity", "settings"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

export function AgentDetail({ id, tab }: { id: string; tab: DetailTab }) {
  const agent = useAgents((s) => s.agents.find((a) => a.id === id));
  if (!agent) return <NotFound />;
  return <Detail agent={agent} tab={tab} />;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-sm px-4 py-20 text-center">
      <h1 className="text-lg font-semibold">Agent not found</h1>
      <p className="mt-1.5 text-xs text-muted-foreground">It may have been deleted on this device.</p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/agents">Back to agents</Link>
      </Button>
    </div>
  );
}

function Detail({ agent, tab }: { agent: Agent; tab: DetailTab }) {
  const setStatus = useAgents((s) => s.setStatus);
  const rebalance = useAgents((s) => s.rebalance);
  const paused = agent.status === "paused";
  const { pool } = agent;
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-4 md:px-6">
      <nav className="flex items-center justify-between gap-2 text-[0.7rem]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Link to="/agents" className="hover:text-foreground">
            ‹ Agents
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="text-foreground">{agent.name}</span>
          <span className="rounded-sm border px-1.5 py-0.25 text-[0.6rem]">{strategyLabel(agent.strategy)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={() => setStatus(agent.id, paused ? "live" : "paused")}>
            {paused ? <PlayIcon /> : <PauseIcon />} {paused ? "Resume" : "Pause"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/agents/$agentId" params={{ agentId: agent.id }} search={{ tab: "settings" }}>
              <Settings2Icon /> Settings
            </Link>
          </Button>
        </div>
      </nav>

      <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <PairIcons pool={pool} size="size-6" />
            <h1 className="text-2xl leading-none font-semibold tracking-tight">{agent.name}</h1>
            <span className="rounded-full border px-2 py-0.5">
              <StatusDot status={agent.status} />
            </span>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-muted-foreground">
            <span>
              Meteora DLMM · {pool.pair} · {pool.feePct}% fee · bin step {pool.binStep}
            </span>
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3" /> {agent.lastAction} {agent.lastActionAgo}
            </span>
            <span className="inline-flex items-center gap-1">
              <ActivityIcon className="size-3" /> Uptime 6d 4h
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => rebalance(agent.id)}
            className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
          >
            <RefreshCwIcon /> Rebalance now
          </Button>
          <Button asChild variant="outline">
            <a href={`https://app.meteora.ag/dlmm/${pool.address}`} target="_blank" rel="noreferrer">
              <ExternalLinkIcon /> Meteora
            </a>
          </Button>
        </div>
      </header>

      <StatCards agent={agent} />

      <div role="tablist" className="mt-4 flex gap-5 border-b text-xs">
        {DETAIL_TABS.map((t) => (
          <Link
            key={t}
            to="/agents/$agentId"
            params={{ agentId: agent.id }}
            search={{ tab: t }}
            role="tab"
            aria-selected={t === tab}
            className={`-mb-px border-b-2 pb-2 capitalize transition-colors ${
              t === tab
                ? "border-brand font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {tab === "overview" && <Overview agent={agent} />}
        {tab === "rules" && <RulesTab agent={agent} />}
        {tab === "settings" && <SettingsTab agent={agent} />}
        {(tab === "positions" || tab === "activity") && (
          <p className="rounded-lg border border-dashed py-14 text-center text-xs text-muted-foreground">Coming soon</p>
        )}
      </div>
    </div>
  );
}

function StatCards({ agent }: { agent: Agent }) {
  const position = POSITION_LABEL[agent.position];
  const cards: { label: string; value: ReactNode; sub: ReactNode }[] = [
    {
      label: "Managed value",
      value: usd(agent.valueUsd),
      sub: (
        <span className={tone(agent.pnl30dPct)}>
          {agent.pnl30dPct > 0 ? "+" : ""}
          {agent.pnl30dPct.toFixed(2)}%
        </span>
      ),
    },
    {
      label: "Net PnL 30d",
      value: <span className={tone(agent.pnl30dUsd)}>{signedUsd(agent.pnl30dUsd)}</span>,
      sub: <span className="text-muted-foreground">today {signedUsd(agent.pnl30dUsd / 30)}</span>,
    },
    {
      label: "Fees earned 24h",
      value: usd(agent.fees24hUsd),
      sub: (
        <span className="text-muted-foreground">{((agent.fees24hUsd / agent.valueUsd) * 100).toFixed(2)}% of TVL</span>
      ),
    },
    {
      label: "Position value",
      value: usd(agent.valueUsd * 0.98),
      sub: <span className={position.text}>{position.label}</span>,
    },
    {
      label: "Rebalances 24h",
      value: `${Math.min(3, agent.rules.maxRebalancesPerDay)} / ${agent.rules.maxRebalancesPerDay}`,
      sub: <span className="text-muted-foreground">next in 42m</span>,
    },
  ];
  return (
    <div className="mt-4 grid grid-cols-2 gap-2.5 md:grid-cols-5">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border bg-card px-3.5 py-3">
          <p className="text-[0.55rem] tracking-[0.1em] text-muted-foreground uppercase">{c.label}</p>
          <p className="mt-1.5 text-lg leading-none font-semibold tracking-tight tabular-nums">{c.value}</p>
          <p className="mt-1.5 text-[0.65rem] tabular-nums">{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

const RANGES = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
  { label: "All", days: 180 },
] as const;

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border bg-card p-4 ${className}`}>{children}</section>;
}

function Overview({ agent }: { agent: Agent }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-4">
        <PnlCard agent={agent} />
        <PositionCard agent={agent} />
      </div>
      <div className="space-y-4">
        <RulesCard agent={agent} />
        <RuntimeCard agent={agent} />
        <ActivityCard agent={agent} />
      </div>
    </div>
  );
}

function PnlCard({ agent }: { agent: Agent }) {
  const [days, setDays] = useState<number>(30);
  const series = pnlSeries(agent, days);
  const end = series.at(-1) ?? 0;
  const min = Math.min(0, ...series);
  const max = Math.max(0, ...series);
  const span = max - min || 1;
  const w = 600;
  const h = 150;
  const x = (i: number) => (i / (series.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / span) * h;
  const line = series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const up = end >= 0;
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[0.55rem] tracking-[0.1em] text-muted-foreground uppercase">Net PnL</p>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className={`text-2xl font-semibold tracking-tight tabular-nums ${tone(end)}`}>{signedUsd(end)}</span>
            <span className={`text-[0.7rem] ${tone(end)}`}>
              {((end / Math.max(agent.valueUsd - end, 1)) * 100).toFixed(2)}%
            </span>
            <span className="text-[0.7rem] text-muted-foreground">last {days} days</span>
          </p>
        </div>
        <div className="inline-flex rounded-md border p-0.5 text-[0.65rem]">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={r.days === days}
              onClick={() => setDays(r.days)}
              className={`rounded-[0.25rem] px-2 py-0.75 ${r.days === days ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="mt-4 h-40 w-full"
        role="img"
        aria-label={`Net PnL over ${days} days`}
      >
        <line x1="0" x2={w} y1={y(0)} y2={y(0)} className="stroke-border" strokeDasharray="3 4" />
        <path d={`${line} L${w} ${y(0)} L0 ${y(0)} Z`} className={up ? "fill-profit/10" : "fill-loss/10"} />
        <path
          d={line}
          className={`fill-none ${up ? "stroke-profit" : "stroke-loss"}`}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="mt-2 flex items-center justify-between text-[0.65rem] text-muted-foreground">
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-profit" /> Net PnL
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-amber-400" /> Fees
          </span>
        </span>
        <span>
          Peak {signedUsd(Math.max(...series))} · Max drawdown{" "}
          {money(Math.min(...series.map((v, i) => v - Math.max(...series.slice(0, i + 1)))), "usd")}
        </span>
      </div>
    </Card>
  );
}

function PositionCard({ agent }: { agent: Agent }) {
  const position = POSITION_LABEL[agent.position];
  const { pool, range } = agent;
  const deposit = agent.valueUsd - agent.pnl30dUsd;
  const half = agent.valueUsd / 2;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-medium">
          <ZapIcon className="size-3.5 text-brand" /> Live position
          <span className={`rounded-sm border px-1.5 py-0.25 text-[0.6rem] ${position.text}`}>{position.label}</span>
        </p>
        <p className="text-[0.65rem] text-muted-foreground">
          Unclaimed fees <span className="text-profit">{signedUsd(agent.fees24hUsd)}</span>
        </p>
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div className="flex items-center gap-3">
          <PairIcons pool={pool} size="size-6" />
          <div>
            <p className="text-xs font-medium">{pool.pair}</p>
            <p className="text-[0.65rem] text-muted-foreground">
              Bins {formatBin(range.lower)} — {formatBin(range.upper)}
            </p>
          </div>
          <div>
            <p className="text-xl font-semibold tabular-nums">{usd(agent.valueUsd)}</p>
            <p className={`text-[0.65rem] ${tone(agent.pnl30dPct)}`}>
              {agent.pnl30dPct > 0 ? "+" : ""}
              {agent.pnl30dPct.toFixed(2)}% vs deposit
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[0.55rem] tracking-[0.1em] text-muted-foreground uppercase">Active bin</p>
          <p className="text-xs font-medium">{formatBin(range.active)}</p>
        </div>
      </div>
      <div className="mt-3">
        <RangeBar range={range} />
        <div className="mt-1 grid grid-cols-3 text-[0.6rem] text-muted-foreground tabular-nums">
          <span>{formatBin(range.lower)}</span>
          <span className="text-center">{formatBin(range.active)} active</span>
          <span className="text-right">{formatBin(range.upper)}</span>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
        {[
          ["Deposit", usd(deposit)],
          [`${pool.tokenX.symbol} side`, `${(half / 182.34).toFixed(2)} ${pool.tokenX.symbol}`],
          [`${pool.tokenY.symbol} side`, usd(half)],
          ["In-range time", agent.position === "in-range" ? "94%" : "61%"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-[0.55rem] tracking-[0.1em] text-muted-foreground uppercase">{k}</dt>
            <dd className="mt-0.5 font-mono text-xs font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function KeyValues({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="mt-2 divide-y">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between py-1.75 text-[0.7rem]">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="font-medium tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const ruleRows = (a: Agent): [string, ReactNode][] => [
  ["Strategy", strategyLabel(a.strategy)],
  ["Cooldown", `${a.rules.cooldownMin} min`],
  ["Range width", `±${a.rules.rangeBins} bins`],
  [
    "Stop-loss",
    a.rules.stopLossPct ? (
      <span key="sl" className="text-loss">
        −{a.rules.stopLossPct}%
      </span>
    ) : (
      "Off"
    ),
  ],
  ["Max rebalances", `${a.rules.maxRebalancesPerDay} / day`],
  ["Low SOL alert", a.rules.lowSol ? `${a.rules.lowSol} SOL` : "Off"],
];

function RulesCard({ agent }: { agent: Agent }) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-medium">
          <ShieldCheckIcon className="size-3.5 text-brand" /> Rules
        </p>
        <Link
          to="/agents/$agentId"
          params={{ agentId: agent.id }}
          search={{ tab: "rules" }}
          className="text-[0.65rem] font-medium text-brand"
        >
          Edit
        </Link>
      </div>
      <KeyValues rows={ruleRows(agent)} />
    </Card>
  );
}

function RuntimeCard({ agent }: { agent: Agent }) {
  const healthy = agent.status !== "attention";
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-medium">
          <ZapIcon className="size-3.5 text-brand" /> Runtime
        </p>
        <span className={`text-[0.65rem] ${healthy ? "text-profit" : "text-amber-500"}`}>
          {healthy ? "✓ Healthy" : "Needs attention"}
        </span>
      </div>
      <KeyValues
        rows={[
          ["Last check", agent.status === "paused" ? "—" : "12s ago"],
          ["Next check", agent.status === "paused" ? "Paused" : "in 18s"],
          ["Wallet balance", "12.48 SOL"],
          ["Telegram", "Connected"],
        ]}
      />
    </Card>
  );
}

function ActivityCard({ agent }: { agent: Agent }) {
  const items = [
    { icon: RefreshCwIcon, text: agent.lastAction, ago: agent.lastActionAgo },
    { icon: ZapIcon, text: `Claimed fees ${signedUsd(agent.fees24hUsd)}`, ago: "2h ago" },
    { icon: PlayIcon, text: "Agent launched in observation mode", ago: "Oct 28" },
  ];
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-medium">
          <ClockIcon className="size-3.5 text-brand" /> Recent activity
        </p>
        <Link
          to="/agents/$agentId"
          params={{ agentId: agent.id }}
          search={{ tab: "activity" }}
          className="text-[0.65rem] font-medium text-brand"
        >
          View all
        </Link>
      </div>
      <ul className="mt-2 divide-y">
        {items.map((i) => (
          <li key={i.text} className="flex items-center gap-2 py-2 text-[0.7rem]">
            <i.icon className="size-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{i.text}</span>
            <span className="font-mono text-[0.6rem] text-muted-foreground">{i.ago}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RulesTab({ agent }: { agent: Agent }) {
  return (
    <Card className="max-w-lg">
      <p className="text-xs font-medium">Rules</p>
      <KeyValues rows={ruleRows(agent)} />
    </Card>
  );
}

function SettingsTab({ agent }: { agent: Agent }) {
  const rename = useAgents((s) => s.rename);
  const remove = useAgents((s) => s.remove);
  const navigate = useNavigate();
  const [name, setName] = useState(agent.name);
  const [confirm, setConfirm] = useState(false);
  return (
    <Card className="max-w-lg space-y-4">
      <div>
        <label htmlFor="agent-name" className="text-xs font-medium">
          Agent name
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id="agent-name"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            className="h-8 flex-1 rounded-md border bg-background px-2.5 text-xs outline-none focus:border-ring"
          />
          <Button
            variant="outline"
            disabled={!name.trim() || name.trim() === agent.name}
            onClick={() => rename(agent.id, name.trim())}
          >
            Save
          </Button>
        </div>
      </div>
      <div className="border-t pt-4">
        <p className="text-xs font-medium">Delete agent</p>
        {confirm ? (
          <div className="mt-2 flex gap-2">
            <Button
              variant="destructive"
              onClick={() => {
                remove(agent.id);
                void navigate({ to: "/agents" });
              }}
            >
              <TrashIcon /> Delete {agent.name}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button variant="destructive" className="mt-2" onClick={() => setConfirm(true)}>
            <TrashIcon /> Delete agent
          </Button>
        )}
      </div>
    </Card>
  );
}
