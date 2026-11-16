import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  BellIcon,
  BotIcon,
  ChevronRightIcon,
  ClockIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  PowerIcon,
  SendIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  WalletIcon,
  WavesIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Notice } from "@/features/portfolio/components/notice";
import { Pagination, PoolFilter, type Sort, sortBy } from "@/features/portfolio/components/table-controls";
import { compactUsd, timeAgo } from "@/features/portfolio/money";
import { screenerQuery } from "@/features/screener/screener.queries";
import {
  type AgentStatus,
  type AgentView,
  agentName,
  agentStatus,
  configFields,
  formatMinutes,
  hourlyCounts,
  parseConfigFields,
  pickSource,
  presetLabel,
  STATUS_LABEL,
  sourceOf,
  statusHint,
  type VolumeAgentView,
  watchedCount,
} from "../agents";
import {
  addAgentPoolFn,
  deleteAgentFn,
  removeAgentPoolFn,
  saveAgentConfig,
  setAgentRunning,
} from "../agents.functions";
import { agentsQuery, alertsQuery } from "../agents.queries";
import {
  AgentsBar,
  ALERT_SORTS,
  type AlertSortKey,
  AlertsTable,
  BarPill,
  KpiCard,
  MiniBars,
  Panel,
  Ring,
  type Tone,
} from "./agent-layout";
import { ConfigForm, FormError, PoolPicker, STATUS_STYLE, TelegramPanel, useAgentMutation } from "./agent-ui";
import { PoolsTable } from "./pools-table";
import { RebalanceHistory, RebalanceOverview, RebalanceRuleSection, WalletPanel } from "./rebalance-ui";
import { ScreenerMatches, SourcePicker } from "./screener-source";

export const DETAIL_TABS = ["overview", "pools", "alerts", "settings"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

const tabLabel = (tab: DetailTab, agent: AgentView) =>
  ({
    overview: "Overview",
    pools: agent.kind === "auto-rebalance" ? "Pool" : "Pools",
    alerts: agent.kind === "auto-rebalance" ? "Rebalance History" : "Alert History",
    settings: "Settings",
  })[tab];

const tabClass =
  "relative shrink-0 whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground/70 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 hover:text-muted-foreground";

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
    <dl className="divide-y border-t px-4 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-2.5 py-3">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Detail({ agent, now, tab }: { agent: AgentView; now: number; tab: DetailTab }) {
  const toggle = useAgentMutation((paused: boolean) => setAgentRunning({ data: { agentId: agent.id, paused } }));
  const hint = statusHint(agent);
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
        <BarPill>{agentName(agent)}</BarPill>
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
            {t === "pools" && agent.kind === "volume-watch" && agent.config.source === "pools" && (
              <span className="ml-1 text-muted-foreground">{agent.pools.length}</span>
            )}
          </Link>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[110rem] flex-col px-4 pt-5 pb-8 md:px-6">
          <PageHeader agent={agent} tab={tab} />
          {hint && <Notice>{hint}</Notice>}
          <FormError error={toggle.error} />
          {tab === "overview" &&
            (agent.kind === "auto-rebalance" ? (
              <RebalanceOverview agent={agent} now={now} />
            ) : (
              <Overview agent={agent} now={now} />
            ))}
          {tab === "pools" && <PoolsTab agent={agent} now={now} />}
          {tab === "alerts" &&
            (agent.kind === "auto-rebalance" ? <RebalanceHistory agentId={agent.id} /> : <AlertsTab now={now} />)}
          {tab === "settings" && <SettingsTab agent={agent} />}
        </div>
      </div>
    </div>
  );
}

function PageHeader({ agent, tab }: { agent: AgentView; tab: DetailTab }) {
  return (
    <h1 className="shrink-0 truncate pb-4 font-brand text-xl font-bold tracking-tight md:text-2xl">
      {tabLabel(tab, agent)}
    </h1>
  );
}

const DAY = 86_400_000;

const STATUS_TONE: Record<AgentStatus, Tone> = { live: "brand", paused: "sky", attention: "amber", off: "sky" };

const STATUS_SUB: Record<AgentStatus, string> = {
  live: "Checking every minute",
  paused: "Paused, nothing is checked",
  attention: "Needs your action",
  off: "Turned off",
};

function Overview({ agent, now }: { agent: VolumeAgentView; now: number }) {
  const { data } = useSuspenseQuery(alertsQuery);
  const status = agentStatus(agent);
  const c = agent.config;
  const { data: screener } = useQuery({ ...screenerQuery, enabled: c.source === "screener" });
  const mine = data.alerts.filter((a) => a.agentId === agent.id);
  const perPool = agent.pools.map(
    (p) => mine.filter((a) => a.poolAddress === p.address && data.now - a.at < DAY).length,
  );
  const cooldownMs = c.cooldownSec * 1000;
  const left = agent.lastAlertAt ? Math.max(0, agent.lastAlertAt + cooldownMs - now) : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<PlayIcon className="size-4 fill-current" />}
          tone={STATUS_TONE[status]}
          label="Status"
          value={<span className={status === "live" ? "" : STATUS_STYLE[status].text}>{STATUS_LABEL[status]}</span>}
          hint={STATUS_SUB[status]}
          visual={<span className={`block size-2.5 rounded-full ${STATUS_STYLE[status].dot}`} />}
        />
        <KpiCard
          icon={<WavesIcon className="size-4" />}
          tone="sky"
          label="Pools"
          value={c.source === "pools" || screener ? watchedCount(agent, screener?.pools) : "—"}
          hint={c.source === "pools" ? "Picked by hand" : `${presetLabel(c.preset)} screener`}
          visual={c.source === "pools" && <MiniBars values={perPool} tone="sky" />}
        />
        <KpiCard
          icon={<BellIcon className="size-4" />}
          tone="violet"
          label="Alerts 24h"
          value={agent.alerts24h}
          hint={agent.lastAlertAt ? `Last ${timeAgo(agent.lastAlertAt, now)}` : "None yet"}
          visual={
            <MiniBars
              values={hourlyCounts(
                mine.map((a) => a.at),
                data.now,
                12,
                2,
              )}
              tone="violet"
              max={24}
            />
          }
        />
        <KpiCard
          icon={<ClockIcon className="size-4" />}
          tone="amber"
          label="Cooldown"
          value={formatMinutes(c.cooldownSec)}
          hint={
            left > 0 ? `${formatMinutes(Math.ceil(left / 1000))} left on the last pool` : "Per pool, after an alert"
          }
          visual={<Ring value={cooldownMs ? left / cooldownMs : 0} tone="amber" />}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-4">
          <Panel
            title="Spike rule"
            className="rounded-xl border"
            action={
              <Button asChild variant="outline" size="sm">
                <Link to="/agents/$agentId" params={{ agentId: agent.id }} search={{ tab: "settings" }}>
                  <PencilIcon /> Edit
                </Link>
              </Button>
            }
          >
            <Rows
              rows={[
                ["Pools", c.source === "pools" ? "Picked by hand" : `${presetLabel(c.preset)} screener`],
                ["Spike", `≥ ${c.mult}× the median`],
                ["Baseline", formatMinutes(c.baseline * 60)],
                ["Min volume", `${compactUsd(c.minUsd)}/min`],
                ["Cooldown", formatMinutes(c.cooldownSec)],
              ]}
            />
          </Panel>
          <Panel title="Telegram" className="rounded-xl border">
            <div className="px-4 pb-4">
              <TelegramPanel kind="volume-watch" />
            </div>
          </Panel>
        </div>
        <Panel
          title="Recent alerts"
          className="self-start overflow-hidden rounded-xl border"
          action={
            <Link
              to="/agents/$agentId"
              params={{ agentId: agent.id }}
              search={{ tab: "alerts" }}
              className="flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              View all <ArrowRightIcon className="size-3.5" />
            </Link>
          }
        >
          <div className="overflow-x-auto border-t">
            <AlertsTable alerts={mine.slice(0, 8)} now={data.now} empty="No alerts yet" />
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PoolsTab({ agent, now }: { agent: AgentView; now: number }) {
  if (agent.kind === "volume-watch" && agent.config.source === "screener")
    return <ScreenerMatches agent={agent} now={now} />;
  return <PickedPools agent={agent} now={now} />;
}

function PickedPools({ agent, now }: { agent: AgentView; now: number }) {
  const add = useAgentMutation(addAgentPoolFn);
  const remove = useAgentMutation(removeAgentPoolFn);
  // An auto-rebalance agent is created for one pool; the way out is deleting the agent.
  const editable = agent.kind === "volume-watch";
  return (
    <div className="flex flex-col gap-4">
      <PoolsTable
        agentId={editable ? agent.id : undefined}
        lastLabel={editable ? "Last alert" : "Last out of range"}
        now={now}
        empty="No pools yet. Add one below."
        rows={agent.pools.map((p) => ({
          address: p.address,
          label: p.label,
          tokens: p.tokens,
          lastAlertAt: p.lastAlertAt,
          removing: remove.isPending && remove.variables?.data.poolId === p.id,
          onRemove: editable ? () => remove.mutate({ data: { agentId: agent.id, poolId: p.id } }) : undefined,
        }))}
      />
      {editable ? (
        <Panel title="Add a pool" className="rounded-xl border">
          <div className="px-4 pb-4">
            <PoolPicker
              taken={agent.pools.map((p) => p.address)}
              count={agent.pools.length}
              busy={add.isPending}
              onPick={(pool) =>
                add.mutate({ data: { ...pool, agentId: agent.id } }, { onSuccess: () => toast.success("Pool added") })
              }
            />
            <FormError error={add.error ?? remove.error} />
          </div>
        </Panel>
      ) : (
        <p className="text-xs text-muted-foreground">
          An auto-rebalance agent keeps the pool it was created for. Create another agent for another pool, or delete
          this one in Settings.
        </p>
      )}
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
    <Panel
      title="All alerts"
      className="overflow-hidden rounded-xl border"
      action={
        <PoolFilter
          value={query}
          onChange={(q) => {
            setQuery(q);
            setPage(0);
          }}
        />
      }
    >
      <div className="overflow-x-auto border-t">
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
    </Panel>
  );
}

function SettingsTab({ agent }: { agent: AgentView }) {
  const power = useAgentMutation((enabled: boolean) => setAgentRunning({ data: { agentId: agent.id, enabled } }));
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
      <nav
        aria-label="Settings"
        className="-mx-1 flex gap-1 overflow-x-auto px-1 md:sticky md:top-4 md:mx-0 md:flex-col md:self-start md:px-0"
      >
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
            <RebalanceRuleSection agent={agent} onDirty={setDirty} />
          ) : (
            <VolumeRuleSection agent={agent} onDirty={setDirty} />
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
            <DeleteAgent agent={agent} />
          </div>
        )}
      </section>
    </div>
  );
}

/** Deletes the agent with its pools and history, after a confirmation. */
function DeleteAgent({ agent }: { agent: AgentView }) {
  const navigate = useNavigate();
  const remove = useAgentMutation(() => deleteAgentFn({ data: { agentId: agent.id } }));
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center justify-between gap-6 border-t pt-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">Delete agent</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Removes the agent, its pools and its history. Positions and funds in the wallet stay where they are.
        </p>
        <FormError error={remove.error} />
      </div>
      <Button variant="outline" size="sm" disabled={remove.isPending} onClick={() => setConfirming(true)}>
        {remove.isPending ? <Spinner /> : <Trash2Icon />}
        Delete
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {agentName(agent)}?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent stops at once and its {agent.kind === "auto-rebalance" ? "rebalance" : "alert"} history is
              deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => remove.mutate(undefined, { onSuccess: () => navigate({ to: "/agents" }) })}
            >
              Delete agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VolumeRuleSection({ agent, onDirty }: { agent: VolumeAgentView; onDirty: (dirty: boolean) => void }) {
  const saved = { fields: configFields(agent.config), source: sourceOf(agent.config) };
  const [form, setForm] = useState(saved);
  const save = useAgentMutation(saveAgentConfig);
  const result = parseConfigFields(form.fields, { ...agent.config, ...form.source });
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const update = (next: typeof form) => {
    setForm(next);
    onDirty(JSON.stringify(next) !== JSON.stringify(saved));
  };
  const { source } = form;
  return (
    <>
      <div className="space-y-4 p-4 sm:p-5">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Pools to watch</h3>
          <p className="text-xs text-muted-foreground">
            Switching to the screener keeps your hand-picked pools, so switching back restores them.
          </p>
          <SourcePicker value={source} onChange={(next) => update(pickSource(form, next))} />
        </section>
        <ConfigForm
          fields={form.fields}
          errors={result.ok ? {} : result.errors}
          onChange={(key, value) => update({ ...form, fields: { ...form.fields, [key]: value } })}
        />
      </div>
      <footer className="flex flex-wrap items-center gap-3 border-t px-4 py-3 sm:px-5">
        <span className="mr-auto text-xs text-muted-foreground">{dirty && "You have unsaved changes"}</span>
        <FormError error={save.error} />
        <Button variant="ghost" size="sm" disabled={!dirty || save.isPending} onClick={() => update(saved)}>
          Reset
        </Button>
        <Button
          size="sm"
          disabled={!result.ok || !dirty || save.isPending}
          onClick={() =>
            result.ok &&
            save.mutate(
              { data: { agentId: agent.id, kind: "volume-watch", config: result.config } },
              {
                onSuccess: () => {
                  onDirty(false);
                  toast.success("Rule saved");
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
    description: "Which pools to watch, and when a pool's volume counts as a spike worth an alert.",
  },
  { id: "telegram", label: "Telegram", icon: SendIcon, description: "Where alerts are sent." },
  {
    id: "wallet",
    label: "Wallet",
    icon: WalletIcon,
    description: "The wallet whose position the agent keeps in range.",
  },
  { id: "agent", label: "Agent", icon: PowerIcon, description: "Turn the agent on or off, or delete it." },
] as const;
type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];
