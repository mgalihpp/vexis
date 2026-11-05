import { Link } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  TerminalIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { money, tone } from "@/features/portfolio/money";
import { useAgents } from "@/stores/agents";
import {
  type Agent,
  type AgentFilter,
  type AgentSort,
  countByFilter,
  FILTERS,
  type FleetSummary,
  formatBin,
  SORTS,
  strategyLabel,
  summarizeFleet,
  visibleAgents,
} from "../agents";
import { AgentAvatar, CustodyNote, PairIcons, POSITION_LABEL, RangeBar, STATUS_STYLE, StatusDot } from "./agent-ui";
import { EmptyAgents } from "./empty-agents";

const usd = (v: number) => money(v, "usd");
const signedUsd = (v: number) => money(v, "usd", { signed: true });
const signedPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;

export function FleetPage() {
  const agents = useAgents((s) => s.agents);
  if (agents.length === 0) return <EmptyAgents />;
  return <Fleet agents={agents} />;
}

function Fleet({ agents }: { agents: Agent[] }) {
  const [filter, setFilter] = useState<AgentFilter>("all");
  const [sort, setSort] = useState<AgentSort>("fees");
  const [query, setQuery] = useState("");
  const summary = summarizeFleet(agents);
  const counts = countByFilter(agents);
  const shown = visibleAgents(agents, { filter, query, sort });

  return (
    <>
      <div className="mx-auto hidden w-full max-w-[1180px] flex-col gap-3 px-6 py-4 md:flex">
        <header className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-[1.375rem] leading-none font-semibold tracking-tight">Agents</h1>
              <span className="inline-flex items-center gap-1 rounded-sm border border-brand/40 px-1.5 py-0.5 text-[0.6rem] font-semibold tracking-wider text-brand uppercase">
                <span className="size-1.25 rounded-full bg-brand" />
                Runtime live
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7.5 text-[0.7rem]">
              <DownloadIcon /> Import
            </Button>
            <NewAgentButton />
          </div>
        </header>

        <CustodyNote />

        <SummaryStrip summary={summary} />

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
            {FILTERS.map((f) => {
              const active = f.value === filter;
              return (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(f.value)}
                  className={`inline-flex items-center gap-1.5 rounded-[0.25rem] px-2.5 py-1.5 transition-colors ${
                    active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.value === "attention" && <span className="size-1.25 rounded-full bg-amber-500" />}
                  {f.label}
                  <span className="text-[0.65rem] text-muted-foreground tabular-nums">{counts[f.value]}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex h-8 w-55 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs text-muted-foreground focus-within:border-ring">
              <SearchIcon className="size-3.5" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search agents"
                aria-label="Search agents"
                className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <SortMenu sort={sort} onSort={setSort} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {shown.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
          {filter === "all" && !query && <NewAgentTile />}
        </div>
        {shown.length === 0 && (
          <p className="rounded-lg border border-dashed py-10 text-center text-xs text-muted-foreground">
            No agents match this filter.
          </p>
        )}
      </div>

      <MobileFleet agents={agents} summary={summary} counts={counts} />
    </>
  );
}

function NewAgentButton({ className = "" }: { className?: string }) {
  return (
    <Button
      asChild
      size="sm"
      className={`h-7.5 bg-brand text-[0.7rem] font-semibold text-brand-foreground hover:bg-brand/90 ${className}`}
    >
      <Link to="/agents/new" search={{ step: "strategy" }}>
        <PlusIcon /> New agent
      </Link>
    </Button>
  );
}

function SortMenu({ sort, onSort }: { sort: AgentSort; onSort: (s: AgentSort) => void }) {
  const label = SORTS.find((s) => s.value === sort)?.label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-8 gap-2 text-xs">
          <SlidersHorizontalIcon className="size-3.5" />
          {label}
          <ChevronDownIcon className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={sort} onValueChange={(v) => onSort(v as AgentSort)}>
          {SORTS.map((s) => (
            <DropdownMenuRadioItem key={s.value} value={s.value}>
              {s.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const Eyebrow = ({ children }: { children: string }) => (
  <p className="text-[0.625rem] tracking-[0.12em] text-muted-foreground uppercase">{children}</p>
);

function SummaryStrip({ summary }: { summary: FleetSummary }) {
  const healthy = summary.total - summary.attention;
  return (
    <div className="grid grid-cols-4 divide-x overflow-hidden rounded-lg border bg-card">
      <div className="px-4 py-3.5">
        <Eyebrow>Managed value</Eyebrow>
        <p className="mt-1.5 text-[1.625rem] leading-none font-semibold tracking-tight tabular-nums">
          {usd(summary.valueUsd)}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span className={tone(summary.pnl30dUsd)}>{signedUsd(summary.pnl30dUsd)}</span> in 30 days
        </p>
      </div>
      <div className="px-4 py-3.5">
        <Eyebrow>Fees earned 24h</Eyebrow>
        <p className="mt-1.5 text-[1.625rem] leading-none font-semibold tracking-tight tabular-nums">
          {usd(summary.fees24hUsd)}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">Across {summary.total} agents</p>
      </div>
      <div className="px-4 py-3.5">
        <Eyebrow>Net PnL 30d</Eyebrow>
        <p
          className={`mt-1.5 text-[1.625rem] leading-none font-semibold tracking-tight tabular-nums ${tone(summary.pnl30dUsd)}`}
        >
          {signedUsd(summary.pnl30dUsd)}
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {summary.best ? `Best: ${summary.best.name} ${signedUsd(summary.best.pnl30dUsd)}` : "No agents yet"}
        </p>
      </div>
      <div className="px-4 py-3.5">
        <Eyebrow>Fleet health</Eyebrow>
        <p className="mt-1.5 text-sm font-medium">
          {summary.live} live
          {summary.attention > 0 && (
            <>
              , <span className="text-amber-600 dark:text-amber-400">{summary.attention} attention</span>
            </>
          )}
        </p>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {Array.from({ length: summary.total }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length decorative segments
              key={i}
              className={`h-1 flex-1 rounded-full ${i < healthy ? "bg-profit" : "bg-amber-500"}`}
            />
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {summary.inRange} of {summary.total} in range
        </p>
      </div>
    </div>
  );
}

function PauseToggle({ agent }: { agent: Agent }) {
  const setStatus = useAgents((s) => s.setStatus);
  const paused = agent.status === "paused";
  const label = paused ? `Resume ${agent.name}` : `Pause ${agent.name}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          onClick={() => setStatus(agent.id, paused ? "live" : "paused")}
        >
          {paused ? <PlayIcon /> : <PauseIcon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{paused ? "Resume" : "Pause"}</TooltipContent>
    </Tooltip>
  );
}

function OpenButton({ agent }: { agent: Agent }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" size="icon-xs">
          <Link to="/agents/$agentId" params={{ agentId: agent.id }} aria-label={`Open ${agent.name}`}>
            <ArrowRightIcon />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Open</TooltipContent>
    </Tooltip>
  );
}

const Stat = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="min-w-0">
    <p className="text-[0.55rem] tracking-[0.1em] text-muted-foreground uppercase">{label}</p>
    <div className="mt-0.5 text-xs font-medium tabular-nums">{children}</div>
  </div>
);

function AgentCard({ agent }: { agent: Agent }) {
  const position = POSITION_LABEL[agent.position];
  const failed = agent.status === "attention";
  return (
    <article className="flex flex-col gap-3.5 rounded-lg border bg-card p-4">
      <div className="flex items-start gap-2.5">
        <AgentAvatar agent={agent} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{agent.name}</p>
          <p className="text-[0.65rem] text-muted-foreground">{strategyLabel(agent.strategy)}</p>
        </div>
        <StatusDot status={agent.status} />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <PairIcons pool={agent.pool} />
          <div className="min-w-0">
            <p className="text-xs font-medium">{agent.pool.pair}</p>
            <p className="truncate text-[0.6rem] text-muted-foreground">
              {agent.pool.feePct}% fee · bin step {agent.pool.binStep}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[0.55rem] tracking-[0.1em] text-muted-foreground uppercase">Position</p>
          <p className={`text-xs font-medium ${position.text}`}>{position.label}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="grid grid-cols-3 text-[0.6rem] text-muted-foreground tabular-nums">
          <span>{formatBin(agent.range.lower)}</span>
          <span className="text-center font-mono text-foreground/80">active {formatBin(agent.range.active)}</span>
          <span className="text-right">{formatBin(agent.range.upper)}</span>
        </div>
        <RangeBar range={agent.range} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Value">{usd(agent.valueUsd)}</Stat>
        <Stat label="Fees 24h">
          <span className="text-profit">{signedUsd(agent.fees24hUsd)}</span>
        </Stat>
        <Stat label="PnL 30d">
          <span className={tone(agent.pnl30dUsd)}>{signedUsd(agent.pnl30dUsd)}</span>
          <span className="block text-[0.6rem] text-muted-foreground">{signedPct(agent.pnl30dPct)}</span>
        </Stat>
      </div>

      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-[0.65rem]">
        <p className={`flex min-w-0 items-center gap-1.5 ${failed ? "text-amber-600 dark:text-amber-400" : ""}`}>
          <TerminalIcon className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{agent.lastAction}</span>
          <span className="shrink-0 font-mono text-muted-foreground">{agent.lastActionAgo}</span>
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          <PauseToggle agent={agent} />
          <OpenButton agent={agent} />
        </div>
      </div>
    </article>
  );
}

function NewAgentTile() {
  return (
    <Link
      to="/agents/new"
      search={{ step: "strategy" }}
      className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors hover:border-brand/50"
    >
      <span className="flex size-9 items-center justify-center rounded-full border border-brand/30 bg-brand/10 text-brand">
        <PlusIcon className="size-4" />
      </span>
      <span className="text-xs font-medium">New agent</span>
    </Link>
  );
}

// --- mobile ------------------------------------------------------------------------------------

function MobileFleet({
  agents,
  summary,
  counts,
}: {
  agents: Agent[];
  summary: FleetSummary;
  counts: Record<AgentFilter, number>;
}) {
  const [filter, setFilter] = useState<AgentFilter>("all");
  const shown = visibleAgents(agents, { filter, query: "", sort: "pnl" });
  return (
    <div className="flex flex-col gap-3 px-4 py-4 md:hidden">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-[0.625rem] tracking-[0.14em] text-muted-foreground uppercase">Automation</p>
          <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">Agents</h1>
        </div>
        <NewAgentButton className="h-9 rounded-full px-4 text-xs" />
      </header>

      <CustodyNote />

      <section className="rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between">
          <div>
            <Eyebrow>Managed value</Eyebrow>
            <p className="mt-1 text-[1.75rem] leading-none font-semibold tabular-nums">{usd(summary.valueUsd)}</p>
          </div>
          <div className="text-right">
            <StatusDot status="live">{summary.live} live</StatusDot>
            <p className={`mt-2.5 text-xs font-medium tabular-nums ${tone(summary.pnl30dUsd)}`}>
              {signedUsd(summary.pnl30dUsd)}
            </p>
          </div>
        </div>
        <div className="mt-3 flex justify-between border-t pt-2.5 text-[0.65rem] text-muted-foreground">
          <span>Fees 24h {usd(summary.fees24hUsd)}</span>
          <span>
            Net PnL 30d <span className={tone(summary.pnl30dPct)}>{signedPct(summary.pnl30dPct)}</span>
          </span>
          <span>
            In range {summary.inRange}/{summary.total}
          </span>
        </div>
      </section>

      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => {
          const active = f.value === filter;
          return (
            <button
              key={f.value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.value)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active ? "border-brand/50 bg-brand/10 text-brand" : "text-muted-foreground"
              }`}
            >
              {f.label} {counts[f.value]}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs">
        <h2 className="font-medium">All agents</h2>
        <span className="text-muted-foreground">Sorted by PnL</span>
      </div>

      <ul className="flex flex-col gap-2.5">
        {shown.map((a) => (
          <li key={a.id}>
            <Link
              to="/agents/$agentId"
              params={{ agentId: a.id }}
              className={`block rounded-xl border p-3.5 ${a.status === "attention" ? "border-red-500/40 bg-red-500/5" : "bg-card"}`}
            >
              <div className="flex items-start gap-2.5">
                <PairIcons pool={a.pool} size="size-6" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    {a.name}
                    <StatusDot status={a.status}>
                      {a.position === "out-of-range" ? "Out of range" : STATUS_STYLE[a.status].label}
                    </StatusDot>
                  </p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    {strategyLabel(a.strategy)} · {a.pool.pair}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{usd(a.valueUsd)}</p>
                  <p className={`text-[0.65rem] tabular-nums ${tone(a.pnl30dUsd)}`}>{signedPct(a.pnl30dPct)}</p>
                </div>
                <ChevronRightIcon className="mt-1 size-4 text-muted-foreground" />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <RangeBar range={a.range} className="flex-1" />
                <span className="text-[0.65rem] text-muted-foreground tabular-nums">fees {usd(a.fees24hUsd)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
