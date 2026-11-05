import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/features/portfolio/money";
import { type AgentView, agentStatus, describeRule, STATUS_HINT, summarizeFleet } from "../agents";
import { setAgentRunning } from "../agents.functions";
import { agentsQuery } from "../agents.queries";
import { AgentAvatar, FormError, poolName, StatusDot, useAgentMutation } from "./agent-ui";
import { EmptyAgents } from "./empty-agents";

export function FleetPage() {
  const { data } = useSuspenseQuery(agentsQuery);
  if (data.agents.length === 0) return <EmptyAgents />;
  const summary = summarizeFleet(data.agents);

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 px-4 py-4 md:px-6">
      <header className="space-y-1">
        <h1 className="text-[1.375rem] leading-none font-semibold tracking-tight">Agents</h1>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Agents watching" value={`${summary.live} of ${summary.total}`} />
        <Stat label="Pools watched" value={String(summary.pools)} />
        <Stat label="Alerts, 24h" value={String(summary.alerts24h)} />
        <Stat
          label="Needs attention"
          value={String(summary.attention)}
          tone={summary.attention ? "text-amber-500" : ""}
        />
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.agents.map((a) => (
          <AgentCard key={a.id} agent={a} now={data.now} />
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3.5 py-3">
      <p className="text-[0.6rem] tracking-[0.1em] text-muted-foreground uppercase">{label}</p>
      <p className={`mt-1 text-lg leading-none font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function AgentCard({ agent, now }: { agent: AgentView; now: number }) {
  const status = agentStatus(agent);
  const toggle = useAgentMutation((paused: boolean) => setAgentRunning({ data: { paused } }));
  const hint = STATUS_HINT[status];
  return (
    <article className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <AgentAvatar status={status} />
          <div>
            <p className="text-sm font-semibold">Volume spike alert</p>
            <StatusDot status={status} />
          </div>
        </div>
        {agent.enabled && (
          <Button variant="outline" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate(!agent.paused)}>
            {agent.paused ? <PlayIcon /> : <PauseIcon />} {agent.paused ? "Resume" : "Pause"}
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{describeRule(agent.config)}</p>

      <div className="flex flex-wrap gap-1.5">
        {agent.pools.slice(0, 4).map((p) => (
          <span key={p.id} className="rounded-full border px-2 py-0.5 text-[0.65rem]">
            {poolName(p)}
          </span>
        ))}
        {agent.pools.length > 4 && (
          <span className="rounded-full border px-2 py-0.5 text-[0.65rem] text-muted-foreground">
            +{agent.pools.length - 4} more
          </span>
        )}
        {agent.pools.length === 0 && <span className="text-[0.7rem] text-muted-foreground">No pools yet</span>}
      </div>

      {hint && <p className="text-[0.7rem] text-amber-600 dark:text-amber-400">{hint}</p>}
      <FormError error={toggle.error} />

      <div className="mt-auto flex items-center justify-between border-t pt-2.5 text-[0.7rem] text-muted-foreground">
        <span>
          {agent.alerts24h} alerts in 24h
          {agent.lastAlertAt ? ` · last ${timeAgo(agent.lastAlertAt, now)}` : ""}
        </span>
        <Link
          to="/agents/$agentId"
          params={{ agentId: agent.id }}
          search={{ tab: "overview" }}
          className="flex items-center gap-1 font-medium text-brand"
        >
          Open <ArrowRightIcon className="size-3" />
        </Link>
      </div>
    </article>
  );
}
