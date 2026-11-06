import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BotIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  PauseIcon,
  PlayIcon,
  PowerIcon,
  SendIcon,
  SlidersHorizontalIcon,
  WalletIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Notice } from "@/features/portfolio/components/notice";
import {
  Pagination,
  PoolFilter,
  SCROLL_TABLE,
  type Sort,
  sortBy,
} from "@/features/portfolio/components/table-controls";
import { timeAgo } from "@/features/portfolio/money";
import {
  AGENT_NAME,
  type AgentView,
  agentStatus,
  type ConfigFields,
  compactUsd,
  configFields,
  formatMinutes,
  parseConfigFields,
  STATUS_LABEL,
  statusHint,
  type VolumeAgentView,
} from "../agents";
import { addAgentPoolFn, removeAgentPoolFn, saveAgentConfig, setAgentRunning } from "../agents.functions";
import { agentsQuery, alertsQuery } from "../agents.queries";
import {
  AgentsBar,
  ALERT_SORTS,
  type AlertSortKey,
  AlertsTable,
  BarPill,
  Panel,
  PoolCell,
  StatCard,
} from "./agent-layout";
import {
  ConfigForm,
  FormError,
  PoolPicker,
  poolName,
  RemovePoolButton,
  STATUS_STYLE,
  TelegramPanel,
  useAgentMutation,
} from "./agent-ui";
import { RebalanceHistory, RebalanceOverview, RebalanceRuleSection, WalletPanel } from "./rebalance-ui";

export const DETAIL_TABS = ["overview", "pools", "alerts", "settings"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

const tabLabel = (tab: DetailTab, agent: AgentView) =>
  ({
    overview: "Overview",
    pools: "Pools",
    alerts: agent.kind === "auto-rebalance" ? "Rebalance History" : "Alert History",
    settings: "Settings",
  })[tab];

const tabClass =
  "relative px-3 py-2 text-xs font-medium text-muted-foreground/70 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 hover:text-muted-foreground";

export function AgentDetail({ id, tab }: { id: string; tab: DetailTab }) {
  const { data } = useSuspenseQuery(agentsQuery);
  const agent = data.agents.find((a) => a.id === id);
  if (!agent) return <NotFound />;
  return <Detail agent={agent} now={data.now} tab={tab} />;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-sm px-4 py-20 text-center">
      <h1 className="text-lg font-semibold">Agent not found</h1>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/agents">Back to agents</Link>
      </Button>
    </div>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="space-y-2 px-3.25 pb-3.25 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Detail({ agent, now, tab }: { agent: AgentView; now: number; tab: DetailTab }) {
  const toggle = useAgentMutation((paused: boolean) => setAgentRunning({ data: { kind: agent.kind, paused } }));
  const hint = statusHint(agent);
  const [notice, setNotice] = useState<string | null>(null);
  // Like the portfolio's tables, the alert history fills the viewport and scrolls inside its table.
  const fixedHeight = tab === "alerts";
  return (
    <div className="flex h-full flex-col">
      <AgentsBar
        actions={
          agent.enabled && (
            <Button
              variant="outline"
              size="sm"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate(!agent.paused)}
            >
              {toggle.isPending ? <Spinner /> : agent.paused ? <PlayIcon /> : <PauseIcon />}
              {agent.paused ? "Resume" : "Pause"}
            </Button>
          )
        }
      >
        <Link to="/agents" className="rounded-md hover:ring-1 hover:ring-border">
          <BarPill icon={<BotIcon className="size-[0.9rem] text-brand" />}>Agents</BarPill>
        </Link>
        <ChevronRightIcon className="size-3.25 shrink-0 text-muted-foreground" />
        <BarPill>{AGENT_NAME[agent.kind]}</BarPill>
      </AgentsBar>

      <nav className="flex shrink-0 overflow-x-auto border-b px-2">
        {DETAIL_TABS.map((t) => (
          <Link
            key={t}
            to="/agents/$agentId"
            params={{ agentId: agent.id }}
            search={{ tab: t }}
            className={`${tabClass} ${t === tab ? "text-foreground! after:bg-brand" : ""}`}
            aria-current={t === tab ? "page" : undefined}
          >
            {tabLabel(t, agent)}
            {t === "pools" && <span className="ml-1 text-muted-foreground">{agent.pools.length}</span>}
          </Link>
        ))}
      </nav>

      <div className={`flex min-h-0 flex-1 flex-col ${fixedHeight ? "overflow-hidden" : "overflow-y-auto"}`}>
        <div className={`flex min-h-0 flex-1 flex-col px-2 pt-2 ${fixedHeight ? "" : "pb-3.25"}`}>
          {hint && <Notice>{hint}</Notice>}
          <FormError error={toggle.error} />
          {notice && (
            <div className="mb-2 flex items-center justify-between gap-3 rounded-md border border-brand/30 bg-brand/10 px-2.5 py-1.5 text-xs text-foreground/80">
              <span>{notice}</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setNotice(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </div>
          )}
          {tab === "overview" &&
            (agent.kind === "auto-rebalance" ? (
              <RebalanceOverview agent={agent} now={now} />
            ) : (
              <Overview agent={agent} now={now} />
            ))}
          {tab === "pools" && <PoolsTab agent={agent} now={now} />}
          {tab === "alerts" && (agent.kind === "auto-rebalance" ? <RebalanceHistory /> : <AlertsTab now={now} />)}
          {tab === "settings" && <SettingsTab agent={agent} onSaved={setNotice} />}
        </div>
      </div>
    </div>
  );
}

function Overview({ agent, now }: { agent: VolumeAgentView; now: number }) {
  const { data } = useSuspenseQuery(alertsQuery);
  const status = agentStatus(agent);
  const tabLink = (tab: DetailTab, label: string) => (
    <Link
      to="/agents/$agentId"
      params={{ agentId: agent.id }}
      search={{ tab }}
      className="text-xs font-medium text-brand hover:underline"
    >
      {label}
    </Link>
  );
  const c = agent.config;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
        <StatCard label="Status" value={STATUS_LABEL[status]} tone={STATUS_STYLE[status].text} />
        <StatCard label="Pools watched" value={agent.pools.length} />
        <StatCard label="Alerts, 24h" value={agent.alerts24h} />
        <StatCard label="Last alert" value={agent.lastAlertAt ? timeAgo(agent.lastAlertAt, now) : "None yet"} />
        <StatCard label="Cooldown" value={formatMinutes(c.cooldownSec)} />
      </div>
      <div className="grid gap-2 xl:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-2">
          <Panel title="Spike rule" action={tabLink("settings", "Edit")}>
            <Rows
              rows={[
                ["Spike", `≥ ${c.mult}× the median`],
                ["Baseline", formatMinutes(c.baseline * 60)],
                ["Min volume", `${compactUsd(c.minUsd)}/min`],
                ["Cooldown", formatMinutes(c.cooldownSec)],
              ]}
            />
          </Panel>
          <Panel title="Telegram">
            <div className="px-3.25 pb-3.25">
              <TelegramPanel kind="volume-watch" />
            </div>
          </Panel>
        </div>
        <Panel title="Recent alerts" action={tabLink("alerts", "View all")} className="overflow-hidden">
          <div className="overflow-x-auto border-t">
            <AlertsTable alerts={data.alerts.slice(0, 8)} now={data.now} empty="No alerts yet" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PoolsTab({ agent, now }: { agent: AgentView; now: number }) {
  const add = useAgentMutation(addAgentPoolFn);
  const remove = useAgentMutation(removeAgentPoolFn);
  return (
    <div className="flex flex-col gap-2">
      <div className="-mx-2 overflow-x-auto">
        <Table className="min-w-[40rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-3.25">Pool</TableHead>
              <TableHead className="text-right">
                {agent.kind === "auto-rebalance" ? "Last out of range" : "Last alert"}
              </TableHead>
              <TableHead className="w-20 pr-3.25" />
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {agent.pools.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  No pools yet. Add one below.
                </TableCell>
              </TableRow>
            )}
            {agent.pools.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="pl-3.25">
                  <PoolCell address={p.address} label={p.label} tokens={p.tokens} />
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {p.lastAlertAt ? timeAgo(p.lastAlertAt, now) : "None yet"}
                </TableCell>
                <TableCell className="pr-3.25">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      to="/analytics"
                      search={{ pool: p.address }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLinkIcon className="size-3.5" />
                      <span className="sr-only">Open analytics</span>
                    </Link>
                    <RemovePoolButton
                      name={poolName(p)}
                      disabled={remove.isPending}
                      pending={remove.isPending && remove.variables?.data.poolId === p.id}
                      onClick={() => remove.mutate({ data: { poolId: p.id } })}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Panel title="Add a pool">
        <div className="px-3.25 pb-3.25">
          <PoolPicker
            taken={agent.pools.map((p) => p.address)}
            count={agent.pools.length}
            busy={add.isPending}
            onPick={(pool) => add.mutate({ data: { ...pool, kind: agent.kind } })}
          />
          <FormError error={add.error ?? remove.error} />
        </div>
      </Panel>
    </div>
  );
}

const PAGE_SIZES = [10, 20, 50, 100];

function AlertsTab({ now }: { now: number }) {
  const { data } = useSuspenseQuery(alertsQuery);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort<AlertSortKey>>({ key: "at", dir: "desc" });
  const [pageSize, setPageSize] = useState(PAGE_SIZES[0] ?? 10);
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = data.alerts.filter(
      (a) => !q || (a.poolLabel ?? "").toLowerCase().includes(q) || a.poolAddress.toLowerCase().includes(q),
    );
    return sortBy(matched, (a, key) => ALERT_SORTS[key](a), sort);
  }, [data.alerts, query, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * pageSize, (current + 1) * pageSize);
  const empty = data.alerts.length === 0 ? "No alerts yet" : `No pools match “${query.trim()}”.`;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <PoolFilter
        value={query}
        onChange={(q) => {
          setQuery(q);
          setPage(0);
        }}
      />
      <div className="-mx-2 flex min-h-0 flex-1 flex-col">
        <div className={SCROLL_TABLE}>
          <AlertsTable
            alerts={shown}
            now={now}
            empty={empty}
            sort={sort}
            onSort={(s) => {
              setSort(s);
              setPage(0);
            }}
          />
        </div>
        <Pagination
          total={rows.length}
          page={current}
          pages={pages}
          pageSize={pageSize}
          sizes={PAGE_SIZES}
          onPage={setPage}
          onPageSize={(size) => {
            setPageSize(size);
            setPage(0);
          }}
        />
      </div>
    </div>
  );
}

function SettingsTab({ agent, onSaved }: { agent: AgentView; onSaved: (message: string) => void }) {
  const power = useAgentMutation((enabled: boolean) => setAgentRunning({ data: { kind: agent.kind, enabled } }));
  const [dirty, setDirty] = useState(false);
  const [section, setSection] = useState<SettingsSectionId>("rule");
  const sections = SETTINGS_SECTIONS.filter((s) => s.id !== "wallet" || agent.kind === "auto-rebalance").map((s) =>
    s.id === "rule" && agent.kind === "auto-rebalance"
      ? { ...s, label: "Rebalance rule", description: "How the position is re-centered when it leaves its range." }
      : s,
  );
  const current = sections.find((s) => s.id === section) ?? SETTINGS_SECTIONS[0];

  return (
    <div className="grid gap-4 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-6">
      <nav aria-label="Settings" className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:px-0">
        {sections.map((s) => {
          const on = s.id === section;
          return (
            <button
              key={s.id}
              type="button"
              aria-current={on ? "page" : undefined}
              onClick={() => setSection(s.id)}
              className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors ${
                on ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              }`}
            >
              <s.icon className={`size-3.5 ${on ? "text-brand" : ""}`} />
              {s.label}
              {s.id === "rule" && dirty && <span className="ml-auto size-1.5 rounded-full bg-brand" aria-hidden />}
            </button>
          );
        })}
      </nav>

      <section className="min-w-0 rounded-lg bg-card">
        <header className="border-b px-4 py-4 sm:px-5">
          <h2 className="text-sm font-semibold">{current.label}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{current.description}</p>
        </header>

        {section === "rule" &&
          (agent.kind === "auto-rebalance" ? (
            <RebalanceRuleSection agent={agent} onSaved={onSaved} onDirty={setDirty} />
          ) : (
            <VolumeRuleSection agent={agent} onSaved={onSaved} onDirty={setDirty} />
          ))}

        {section === "telegram" && (
          <div className="p-4 sm:p-5">
            <TelegramPanel kind={agent.kind} />
          </div>
        )}

        {section === "wallet" && (
          <div className="p-4 sm:p-5">
            <WalletPanel />
          </div>
        )}

        {section === "agent" && (
          <div className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-6">
              <div className="min-w-0">
                <label htmlFor="agent-enabled" className="flex items-center gap-2 text-sm font-medium">
                  Turned on
                  {power.isPending && <Spinner className="size-3.5 text-muted-foreground" />}
                </label>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  When off, the runner skips this agent: nothing is judged and no alerts are sent.
                </p>
              </div>
              <Switch
                id="agent-enabled"
                checked={agent.enabled}
                disabled={power.isPending}
                onCheckedChange={(on) => power.mutate(on)}
              />
            </div>
            <FormError error={power.error} />
          </div>
        )}
      </section>
    </div>
  );
}

function VolumeRuleSection({
  agent,
  onSaved,
  onDirty,
}: {
  agent: VolumeAgentView;
  onSaved: (message: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [fields, setFields] = useState<ConfigFields>(() => configFields(agent.config));
  const save = useAgentMutation(saveAgentConfig);
  const result = parseConfigFields(fields, agent.config);
  const dirty = JSON.stringify(fields) !== JSON.stringify(configFields(agent.config));
  const update = (next: ConfigFields) => {
    setFields(next);
    onDirty(JSON.stringify(next) !== JSON.stringify(configFields(agent.config)));
  };
  return (
    <>
      <div className="p-4 sm:p-5">
        <ConfigForm
          fields={fields}
          errors={result.ok ? {} : result.errors}
          onChange={(key, value) => update({ ...fields, [key]: value })}
        />
      </div>
      <footer className="flex flex-wrap items-center gap-3 border-t px-4 py-3 sm:px-5">
        <span className="mr-auto text-xs text-muted-foreground">{dirty && "You have unsaved changes"}</span>
        <FormError error={save.error} />
        <Button
          variant="ghost"
          size="sm"
          disabled={!dirty || save.isPending}
          onClick={() => update(configFields(agent.config))}
        >
          Reset
        </Button>
        <Button
          size="sm"
          disabled={!result.ok || !dirty || save.isPending}
          onClick={() =>
            result.ok &&
            save.mutate(
              { data: { kind: "volume-watch", config: result.config } },
              {
                onSuccess: () => {
                  onDirty(false);
                  onSaved("Rule saved");
                },
              },
            )
          }
          className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
        >
          {save.isPending && <Spinner />}
          {save.isPending ? "Saving" : "Save rule"}
        </Button>
      </footer>
    </>
  );
}

const SETTINGS_SECTIONS = [
  {
    id: "rule",
    label: "Spike rule",
    icon: SlidersHorizontalIcon,
    description: "When a pool's volume counts as a spike worth an alert.",
  },
  { id: "telegram", label: "Telegram", icon: SendIcon, description: "Where alerts are sent." },
  {
    id: "wallet",
    label: "Wallet",
    icon: WalletIcon,
    description: "The wallet whose position the agent keeps in range.",
  },
  { id: "agent", label: "Agent", icon: PowerIcon, description: "Turn the agent on or off." },
] as const;
type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
