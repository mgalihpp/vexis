import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRightIcon, ExternalLinkIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { timeAgo, utcStamp } from "@/features/portfolio/money";
import { shortAddr } from "@/lib/format";
import {
  type AgentView,
  agentStatus,
  type ConfigFields,
  compactUsd,
  configFields,
  describeRule,
  formatMinutes,
  parseConfigFields,
  ratioText,
  STATUS_HINT,
} from "../agents";
import { addAgentPoolFn, removeAgentPoolFn, saveAgentConfig, setAgentRunning } from "../agents.functions";
import { agentsQuery, alertsQuery } from "../agents.queries";
import {
  AgentAvatar,
  ConfigForm,
  FormError,
  PoolPicker,
  poolName,
  StatusDot,
  TelegramPanel,
  useAgentMutation,
} from "./agent-ui";

export const DETAIL_TABS = ["overview", "pools", "alerts", "settings"] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

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
      <p className="mt-1.5 text-xs text-muted-foreground">It may belong to another account or no longer exist.</p>
      <Button asChild variant="outline" className="mt-4">
        <Link to="/agents">Back to agents</Link>
      </Button>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Detail({ agent, now, tab }: { agent: AgentView; now: number; tab: DetailTab }) {
  const status = agentStatus(agent);
  const toggle = useAgentMutation((paused: boolean) => setAgentRunning({ data: { paused } }));
  const hint = STATUS_HINT[status];
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-4 md:px-6">
      <nav className="flex items-center justify-between gap-2 text-[0.7rem]">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Link to="/agents" className="hover:text-foreground">
            ‹ Agents
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="text-foreground">Volume spike alert</span>
        </div>
        {agent.enabled && (
          <Button variant="outline" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate(!agent.paused)}>
            {agent.paused ? <PlayIcon /> : <PauseIcon />} {agent.paused ? "Resume" : "Pause"}
          </Button>
        )}
      </nav>

      <header className="mt-3 flex items-center gap-2.5">
        <AgentAvatar status={status} className="size-9" />
        <div className="space-y-1">
          <h1 className="text-2xl leading-none font-semibold tracking-tight">Volume spike alert</h1>
          <StatusDot status={status} />
        </div>
      </header>
      {hint && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{hint}</p>}
      <FormError error={toggle.error} />

      <div role="tablist" className="mt-4 flex gap-5 border-b text-xs">
        {DETAIL_TABS.map((t) => (
          <Link
            key={t}
            to="/agents/$agentId"
            params={{ agentId: agent.id }}
            search={{ tab: t }}
            role="tab"
            aria-selected={t === tab}
            className={`-mb-px border-b-2 pb-2 capitalize ${
              t === tab
                ? "border-brand text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
            {t === "pools" && <span className="ml-1 text-muted-foreground">{agent.pools.length}</span>}
          </Link>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {tab === "overview" && <Overview agent={agent} now={now} />}
        {tab === "pools" && <PoolsTab agent={agent} />}
        {tab === "alerts" && <AlertsTab />}
        {tab === "settings" && <SettingsTab agent={agent} />}
      </div>
    </div>
  );
}

function Overview({ agent, now }: { agent: AgentView; now: number }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Pools watched", String(agent.pools.length)],
          ["Alerts, 24h", String(agent.alerts24h)],
          ["Last alert", agent.lastAlertAt ? timeAgo(agent.lastAlertAt, now) : "None yet"],
          ["Cooldown", formatMinutes(agent.config.cooldownSec)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-card px-3.5 py-3">
            <p className="text-[0.6rem] tracking-[0.1em] text-muted-foreground uppercase">{label}</p>
            <p className="mt-1 text-lg leading-none font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Rule">
          <p className="text-xs">{describeRule(agent.config)}</p>
          <Link
            to="/agents/$agentId"
            params={{ agentId: agent.id }}
            search={{ tab: "settings" }}
            className="text-[0.7rem] font-medium text-brand"
          >
            Edit rule
          </Link>
        </Card>
        <Card title="Telegram">
          <TelegramPanel />
        </Card>
      </div>
    </>
  );
}

function PoolsTab({ agent }: { agent: AgentView }) {
  const add = useAgentMutation(addAgentPoolFn);
  const remove = useAgentMutation(removeAgentPoolFn);
  return (
    <Card title="Watched pools">
      <PoolPicker
        taken={agent.pools.map((p) => p.address)}
        count={agent.pools.length}
        busy={add.isPending}
        onPick={(pool) => add.mutate({ data: pool })}
      />
      <FormError error={add.error ?? remove.error} />
      {agent.pools.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
          This agent has no pools, so it has nothing to watch.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {agent.pools.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
              <span className="min-w-0">
                <span className="font-medium">{poolName(p)}</span>
                <span className="ml-2 text-muted-foreground">{shortAddr(p.address)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <Link
                  to="/analytics"
                  search={{ pool: p.address }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLinkIcon className="size-3.5" />
                  <span className="sr-only">Open analytics</span>
                </Link>
                <button
                  type="button"
                  aria-label={`Stop watching ${poolName(p)}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ data: { poolId: p.id } })}
                  className="text-muted-foreground hover:text-loss"
                >
                  <XIcon className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AlertsTab() {
  const { data } = useSuspenseQuery(alertsQuery);
  return (
    <Card title="Alert history">
      {data.alerts.length === 0 ? (
        <p className="rounded-md border border-dashed py-8 text-center text-xs text-muted-foreground">
          No alerts yet. They show up here as soon as a watched pool spikes.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[0.65rem] tracking-wider text-muted-foreground uppercase">
                <th className="py-1.5 pr-3 font-medium">When (UTC)</th>
                <th className="py-1.5 pr-3 font-medium">Pool</th>
                <th className="py-1.5 pr-3 text-right font-medium">1 min volume</th>
                <th className="py-1.5 pr-3 text-right font-medium">Baseline</th>
                <th className="py-1.5 pr-3 text-right font-medium">Ratio</th>
                <th className="py-1.5 font-medium">Telegram</th>
              </tr>
            </thead>
            <tbody>
              {data.alerts.map((a) => (
                <tr key={a.id} className="border-b last:border-0">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{utcStamp(a.at)}</td>
                  <td className="py-1.5 pr-3">
                    <Link to="/analytics" search={{ pool: a.poolAddress }} className="hover:text-brand">
                      {a.poolLabel ?? shortAddr(a.poolAddress)}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{compactUsd(a.vol1m)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{compactUsd(a.baseline)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{ratioText(a.ratio)}</td>
                  <td className="py-1.5">
                    {a.delivered ? (
                      <span className="text-profit">Sent</span>
                    ) : (
                      <span className="text-loss" title={a.error ?? undefined}>
                        {a.error ? "Failed" : "Pending"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[0.65rem] text-muted-foreground">Latest {data.alerts.length} alerts, newest first.</p>
    </Card>
  );
}

function SettingsTab({ agent }: { agent: AgentView }) {
  const [fields, setFields] = useState<ConfigFields>(() => configFields(agent.config));
  const save = useAgentMutation(saveAgentConfig);
  const power = useAgentMutation((enabled: boolean) => setAgentRunning({ data: { enabled } }));
  const result = parseConfigFields(fields, agent.config);
  const dirty = JSON.stringify(fields) !== JSON.stringify(configFields(agent.config));
  return (
    <>
      <Card title="Rule">
        <ConfigForm
          fields={fields}
          errors={result.ok ? {} : result.errors}
          onChange={(key, value) => setFields((f) => ({ ...f, [key]: value }))}
        />
        <div className="flex items-center gap-2">
          <Button
            disabled={!result.ok || !dirty || save.isPending}
            onClick={() => result.ok && save.mutate({ data: result.config })}
            className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
          >
            {save.isPending ? "Saving…" : "Save rule"}
          </Button>
          {save.isSuccess && !dirty && <span className="text-[0.7rem] text-profit">Saved</span>}
        </div>
        <FormError error={save.error} />
      </Card>
      <Card title="Agent">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span>
            <label htmlFor="agent-enabled" className="block font-medium">
              Turned on
            </label>
            <span className="block text-muted-foreground">Off stops all checks and alerts for this agent.</span>
          </span>
          <Switch
            id="agent-enabled"
            checked={agent.enabled}
            disabled={power.isPending}
            onCheckedChange={(on) => power.mutate(on)}
          />
        </div>
        <FormError error={power.error} />
      </Card>
    </>
  );
}
