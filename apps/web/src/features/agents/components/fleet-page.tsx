import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  EyeIcon,
  FilterIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SettingsIcon,
  TrendingUpIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PoolFilter } from "@/features/portfolio/components/table-controls";
import { timeAgo } from "@/features/portfolio/money";
import {
  AGENT_NAME,
  type AgentKind,
  type AgentStatus,
  type AgentView,
  agentName,
  agentStatus,
  presetLabel,
  ruleSummary,
  screenerPreset,
} from "../agents";
import { setAgentRunning } from "../agents.functions";
import { agentsQuery } from "../agents.queries";
import { MENU_TRIGGER, PairLogo } from "./agent-layout";
import { AgentAvatar, FormError, poolName, STATUS_STYLE, StatusDot, useAgentMutation } from "./agent-ui";
import { EmptyAgents } from "./empty-agents";

const PAGE_SIZES = [10, 20, 50];

const TABS = [
  { id: "all", label: "All agents" },
  { id: "live", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "attention", label: "Attention" },
  { id: "off", label: "Inactive" },
] as const satisfies { id: AgentStatus | "all"; label: string }[];

type Tab = (typeof TABS)[number]["id"];

const STATUS_PILL: Record<AgentStatus, { label: string; tone: string }> = {
  live: { label: "Running", tone: "bg-profit/12 border-profit/25" },
  paused: { label: "Paused", tone: "bg-muted border-border" },
  attention: { label: "Attention", tone: "bg-amber-500/10 border-amber-500/25" },
  off: { label: "Off", tone: "bg-muted border-border" },
};

const KINDS = Object.keys(AGENT_NAME) as AgentKind[];

function matches(agent: AgentView, query: string) {
  if (!query) return true;
  const q = query.toLowerCase();
  return [agentName(agent), ...agent.pools.map(poolName)].some((s) => s.toLowerCase().includes(q));
}

export function FleetPage() {
  const { data } = useSuspenseQuery(agentsQuery);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<AgentKind[]>(KINDS);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0] ?? 10);
  if (data.agents.length === 0) return <EmptyAgents />;

  const statuses = data.agents.map(agentStatus);
  const count = (t: Tab) => (t === "all" ? statuses.length : statuses.filter((s) => s === t).length);
  const shown = data.agents.filter(
    (a, i) => (tab === "all" || statuses[i] === tab) && kinds.includes(a.kind) && matches(a, query.trim()),
  );
  const pages = Math.max(1, Math.ceil(shown.length / pageSize));
  const current = Math.min(page, pages - 1);
  const rows = shown.slice(current * pageSize, (current + 1) * pageSize);
  const pick = (next: () => void) => {
    next();
    setPage(0);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-5 px-4 pt-6 pb-8 md:px-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="truncate font-brand text-xl font-bold tracking-tight md:text-2xl">Agents</h1>
          <Button asChild size="sm" className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90">
            <Link to="/agents/new" search={{ step: "agent" }}>
              <PlusIcon /> New agent
            </Link>
          </Button>
        </header>

        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4">
            <div role="tablist" className="-mb-px flex gap-5 overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => pick(() => setTab(t.id))}
                  className={`flex shrink-0 items-center gap-2 border-b-2 py-3.5 text-sm font-medium transition-colors ${
                    tab === t.id
                      ? "border-brand text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[0.65rem] tabular-nums ${
                      tab === t.id ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count(t.id)}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex w-full items-center gap-2 pb-3 sm:w-auto sm:py-2.5">
              <PoolFilter value={query} onChange={(q) => pick(() => setQuery(q))} placeholder="Search agents" />
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Filter by kind"
                  className={`${MENU_TRIGGER} ${kinds.length < KINDS.length ? "border-brand/60 text-brand" : ""}`}
                >
                  <FilterIcon className="size-3.25" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuLabel>Kind</DropdownMenuLabel>
                  {KINDS.map((k) => (
                    <DropdownMenuCheckboxItem
                      key={k}
                      checked={kinds.includes(k)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={(on) =>
                        pick(() => setKinds((ks) => (on ? [...ks, k] : ks.filter((x) => x !== k))))
                      }
                    >
                      {AGENT_NAME[k]}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <Table className="min-w-[60rem]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-11 pl-4">Agent</TableHead>
                <TableHead>Pools</TableHead>
                <TableHead>Rule</TableHead>
                <TableHead className="text-center">Alerts 24h</TableHead>
                <TableHead>Last alert</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="tabular-nums">
              {rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                    No agents match these filters.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((a) => (
                <AgentRow key={a.id} agent={a} now={data.now} />
              ))}
            </TableBody>
          </Table>

          <Pagination
            total={shown.length}
            page={current}
            pages={pages}
            pageSize={pageSize}
            sizes={PAGE_SIZES}
            onPage={setPage}
            onPageSize={(size) => pick(() => setPageSize(size))}
          />
        </section>
      </div>
    </div>
  );
}

function AgentRow({ agent, now }: { agent: AgentView; now: number }) {
  const status = agentStatus(agent);
  const toggle = useAgentMutation((paused: boolean) => setAgentRunning({ data: { agentId: agent.id, paused } }));
  const [first, ...rest] = agent.pools;
  const preset = screenerPreset(agent);
  const pill = STATUS_PILL[status];
  return (
    <TableRow>
      <TableCell className="py-3.5 pl-4">
        <Link
          to="/agents/$agentId"
          params={{ agentId: agent.id }}
          search={{ tab: "overview" }}
          className="group flex items-center gap-3"
        >
          <AgentAvatar status={status} className="size-10" />
          <div>
            <div className="text-sm font-semibold group-hover:text-brand">{agentName(agent)}</div>
            <StatusDot status={status} />
          </div>
        </Link>
        <FormError error={toggle.error} />
      </TableCell>
      <TableCell>
        {preset ? (
          <span className="font-medium">{presetLabel(preset)} screener</span>
        ) : first ? (
          <div className="flex items-center gap-2">
            <PairLogo tokens={first.tokens} name={poolName(first)} />
            <span className="font-semibold">{poolName(first)}</span>
            {rest.length > 0 && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[0.65rem] text-muted-foreground">
                +{rest.length}
              </span>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">No pools</span>
        )}
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-2 font-medium">
          <TrendingUpIcon className="size-3.5 shrink-0 text-muted-foreground" />
          {ruleSummary(agent)
            .map(([, value]) => value)
            .join(" · ")}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <span className="inline-flex h-7 min-w-9 items-center justify-center rounded-md bg-muted px-2 font-semibold">
          {agent.alerts24h}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {agent.lastAlertAt ? timeAgo(agent.lastAlertAt, now) : "None yet"}
      </TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.7rem] font-medium ${pill.tone} ${STATUS_STYLE[status].text}`}
        >
          <span className={`size-1.5 rounded-full ${STATUS_STYLE[status].dot}`} />
          {pill.label}
        </span>
      </TableCell>
      <TableCell className="pr-4 text-center">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Agent actions" disabled={toggle.isPending} className={MENU_TRIGGER}>
            {toggle.isPending ? <Spinner className="size-3.25" /> : <MoreHorizontalIcon className="size-3.25" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem asChild>
              <Link to="/agents/$agentId" params={{ agentId: agent.id }} search={{ tab: "overview" }}>
                <EyeIcon className="size-3.5" /> Open
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/agents/$agentId" params={{ agentId: agent.id }} search={{ tab: "settings" }}>
                <SettingsIcon className="size-3.5" /> Settings
              </Link>
            </DropdownMenuItem>
            {agent.enabled && (
              <DropdownMenuItem onSelect={() => toggle.mutate(!agent.paused)}>
                {agent.paused ? <PlayIcon className="size-3.5" /> : <PauseIcon className="size-3.5" />}{" "}
                {agent.paused ? "Resume" : "Pause"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
