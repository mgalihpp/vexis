import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, PauseIcon, PlayIcon, PlusIcon, TerminalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { TokenIcon } from "@/features/portfolio/components/pool-identity";
import { compactUsd, timeAgo } from "@/features/portfolio/money";
import { type AgentView, agentStatus, formatMinutes, summarizeFleet } from "../agents";
import { setAgentRunning } from "../agents.functions";
import { agentsQuery } from "../agents.queries";
import { AgentAvatar, FormError, poolName, StatusDot, useAgentMutation } from "./agent-ui";
import { EmptyAgents } from "./empty-agents";

export function FleetPage() {
  const { data } = useSuspenseQuery(agentsQuery);
  if (data.agents.length === 0) return <EmptyAgents />;
  const summary = summarizeFleet(data.agents);

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 py-4 md:px-6">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-[1.375rem] leading-none font-semibold tracking-tight">Agents</h1>
        <Button asChild size="sm" className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90">
          <Link to="/agents/new" search={{ step: "agent" }}>
            <PlusIcon /> New agent
          </Link>
        </Button>
      </header>

      <section className="grid grid-cols-2 divide-border rounded-xl border bg-card md:grid-cols-4 md:divide-x">
        <Stat label="Live" value={`${summary.live} of ${summary.total}`} />
        <Stat label="Pools" value={String(summary.pools)} />
        <Stat label="Alerts 24h" value={String(summary.alerts24h)} />
        <Stat label="Attention" value={String(summary.attention)} tone={summary.attention ? "text-amber-500" : ""} />
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.agents.map((a) => (
          <AgentCard key={a.id} agent={a} now={data.now} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-[0.65rem] tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
      <p className={`mt-2 text-xl leading-none font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.6rem] tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}

function AgentCard({ agent, now }: { agent: AgentView; now: number }) {
  const status = agentStatus(agent);
  const toggle = useAgentMutation((paused: boolean) => setAgentRunning({ data: { paused } }));
  const [first, ...rest] = agent.pools;
  const c = agent.config;
  return (
    <article className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <AgentAvatar status={status} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Volume spike</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {first?.tokens && (
              <span className="flex shrink-0">
                <TokenIcon token={first.tokens[0]} className="relative z-10 size-4 text-[0.55rem] ring-2 ring-card" />
                <TokenIcon token={first.tokens[1]} className="-ml-1.5 size-4 text-[0.55rem] ring-2 ring-card" />
              </span>
            )}
            <span className="truncate">
              {first ? poolName(first) : "No pools"}
              {rest.length > 0 ? ` +${rest.length}` : ""}
            </span>
          </p>
        </div>
        <StatusDot status={status} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Metric label="Spike" value={`≥ ${c.mult}×`} />
        <Metric label="Baseline" value={formatMinutes(c.baseline * 60)} />
        <Metric label="Min volume" value={`${compactUsd(c.minUsd)}/min`} />
      </div>

      <FormError error={toggle.error} />

      <div className="mt-auto flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <TerminalIcon className="size-3.5 shrink-0" />
          <span className="truncate">
            {agent.lastAlertAt
              ? `${agent.alerts24h} alerts · last ${timeAgo(agent.lastAlertAt, now)}`
              : "No alerts yet"}
          </span>
        </span>
        {agent.enabled && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={agent.paused ? "Resume" : "Pause"}
            disabled={toggle.isPending}
            onClick={() => toggle.mutate(!agent.paused)}
          >
            {toggle.isPending ? <Spinner /> : agent.paused ? <PlayIcon /> : <PauseIcon />}
          </Button>
        )}
        <Link
          to="/agents/$agentId"
          params={{ agentId: agent.id }}
          search={{ tab: "overview" }}
          aria-label="Open agent"
          className="flex size-7 items-center justify-center rounded-md text-foreground hover:bg-muted hover:text-brand"
        >
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>
    </article>
  );
}
