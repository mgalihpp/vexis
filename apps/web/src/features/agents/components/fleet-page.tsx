import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BotIcon, ChevronRightIcon, PauseIcon, PlayIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tile } from "@/features/portfolio/components/active-figures";
import { SCROLL_TABLE, type View, ViewToggle } from "@/features/portfolio/components/table-controls";
import { timeAgo } from "@/features/portfolio/money";
import { type AgentView, agentName, agentStatus, formatMinutes, ruleSummary, summarizeFleet } from "../agents";
import { setAgentRunning } from "../agents.functions";
import { agentsQuery } from "../agents.queries";
import { AgentsBar, BarPill, PairLogo, StatCard } from "./agent-layout";
import { AgentAvatar, FormError, poolName, StatusDot, useAgentMutation } from "./agent-ui";
import { EmptyAgents } from "./empty-agents";

export function FleetPage() {
  const { data } = useSuspenseQuery(agentsQuery);
  const [view, setView] = useState<View>("table");
  if (data.agents.length === 0) return <EmptyAgents />;
  const summary = summarizeFleet(data.agents);

  return (
    <div className="flex h-full flex-col">
      <AgentsBar actions={<NewAgentButton />}>
        <BarPill icon={<BotIcon className="size-[0.9rem] text-brand" />}>Agents</BarPill>
      </AgentsBar>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pt-2 pb-3.25">
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          <StatCard label="Active" value={`${summary.live} of ${summary.total}`} />
          <StatCard label="Pools" value={summary.pools} />
          <StatCard label="Alerts 24h" value={summary.alerts24h} />
          <StatCard label="Attention" value={summary.attention} tone={summary.attention ? "text-amber-500" : ""} />
        </div>
        <div className="flex items-center justify-end">
          <ViewToggle view={view} onChange={setView} />
        </div>
        {view === "grid" ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {data.agents.map((a) => (
              <AgentCard key={a.id} agent={a} now={data.now} />
            ))}
          </div>
        ) : (
          <div className="-mx-2 flex min-h-0 flex-col">
            <div className={SCROLL_TABLE}>
              <Table className="min-w-[56rem]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-3.25">Agent</TableHead>
                    <TableHead>Pools</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead className="text-right">Alerts 24h</TableHead>
                    <TableHead className="text-right">Last alert</TableHead>
                    <TableHead className="w-20 pr-3.25" />
                  </TableRow>
                </TableHeader>
                <TableBody className="tabular-nums">
                  {data.agents.map((a) => (
                    <AgentRow key={a.id} agent={a} now={data.now} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NewAgentButton() {
  return (
    <Button asChild size="sm" className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90">
      <Link to="/agents/new" search={{ step: "agent" }}>
        <PlusIcon /> New agent
      </Link>
    </Button>
  );
}

function AgentRow({ agent, now }: { agent: AgentView; now: number }) {
  const status = agentStatus(agent);
  const toggle = useAgentMutation((paused: boolean) => setAgentRunning({ data: { agentId: agent.id, paused } }));
  const [first, ...rest] = agent.pools;
  return (
    <TableRow>
      <TableCell className="pl-3.25">
        <Link
          to="/agents/$agentId"
          params={{ agentId: agent.id }}
          search={{ tab: "overview" }}
          className="group flex items-center gap-2.5"
        >
          <AgentAvatar status={status} className="size-8" />
          <div>
            <div className="text-xs font-semibold group-hover:text-brand">{agentName(agent)}</div>
            <StatusDot status={status} />
          </div>
        </Link>
        <FormError error={toggle.error} />
      </TableCell>
      <TableCell>
        {first ? (
          <div className="flex items-center gap-2">
            <PairLogo tokens={first.tokens} name={poolName(first)} />
            <span className="font-medium">{poolName(first)}</span>
            {rest.length > 0 && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">
                +{rest.length}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">No pools</span>
        )}
      </TableCell>
      <TableCell className="font-medium">
        {ruleSummary(agent)
          .map(([, value]) => value)
          .join(" · ")}
      </TableCell>
      <TableCell className="text-right font-semibold">{agent.alerts24h}</TableCell>
      <TableCell className="text-right text-muted-foreground">
        {agent.lastAlertAt ? timeAgo(agent.lastAlertAt, now) : "None yet"}
      </TableCell>
      <TableCell className="pr-3.25">
        <div className="flex items-center justify-end gap-0.5">
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
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRightIcon className="size-4" />
          </Link>
        </div>
      </TableCell>
    </TableRow>
  );
}

function AgentCard({ agent, now }: { agent: AgentView; now: number }) {
  const status = agentStatus(agent);
  const toggle = useAgentMutation((paused: boolean) => setAgentRunning({ data: { agentId: agent.id, paused } }));
  return (
    <article className="rounded-lg border bg-card p-2.5 text-xs tabular-nums">
      <div className="flex items-start justify-between gap-1.5">
        <Link
          to="/agents/$agentId"
          params={{ agentId: agent.id }}
          search={{ tab: "overview" }}
          className="group flex min-w-0 items-center gap-2.5"
        >
          <AgentAvatar status={status} className="size-9" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold group-hover:text-brand">{agentName(agent)}</div>
            <StatusDot status={status} />
          </div>
        </Link>
        <div className="flex items-center gap-0.5">
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
            className="rounded p-0.75 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRightIcon className="size-3.25" />
          </Link>
        </div>
      </div>
      <FormError error={toggle.error} />
      <Tile label={`Pools · ${agent.pools.length}`} className="mt-2.5">
        {agent.pools.length === 0 ? (
          <span className="text-muted-foreground">No pools</span>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {agent.pools.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5 font-medium">
                <PairLogo tokens={p.tokens} name={poolName(p)} size="sm" />
                {poolName(p)}
              </span>
            ))}
          </div>
        )}
      </Tile>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {ruleSummary(agent).map(([label, value], i) => (
          <Tile key={label} label={label} className={i === 0 ? "" : "text-right"}>
            {i === 0 ? <span className="font-semibold">{value}</span> : value}
          </Tile>
        ))}
        <Tile label="Alerts 24h">
          <span className="font-semibold">{agent.alerts24h}</span>
        </Tile>
        <Tile label="Last alert" className="text-right">
          {agent.lastAlertAt ? timeAgo(agent.lastAlertAt, now) : "None yet"}
        </Tile>
        <Tile label="Cooldown" className="text-right">
          {formatMinutes(agent.config.cooldownSec)}
        </Tile>
      </div>
    </article>
  );
}
