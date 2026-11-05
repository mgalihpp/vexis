import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronRightIcon, ExternalLinkIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { TokenIcon } from "@/features/portfolio/components/pool-identity";
import { timeAgo, utcStamp } from "@/features/portfolio/money";
import { shortAddr } from "@/lib/format";
import {
  type AgentView,
  type AlertView,
  agentStatus,
  type ConfigFields,
  compactUsd,
  configFields,
  formatMinutes,
  type PoolView,
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
  RemovePoolButton,
  SelectedPool,
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
      <Button asChild variant="outline" className="mt-4">
        <Link to="/agents">Back to agents</Link>
      </Button>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </header>
      <div className="space-y-3 border-t p-4">{children}</div>
    </section>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="-my-1 divide-y text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-2">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Detail({ agent, now, tab }: { agent: AgentView; now: number; tab: DetailTab }) {
  const status = agentStatus(agent);
  const toggle = useAgentMutation((paused: boolean) => setAgentRunning({ data: { paused } }));
  const hint = STATUS_HINT[status];
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-4 md:px-6">
      <nav className="flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Link to="/agents" className="flex items-center gap-1 hover:text-foreground">
            <ArrowLeftIcon className="size-3.5" /> Agents
          </Link>
          <ChevronRightIcon className="size-3" />
          <span className="text-foreground">Volume spike</span>
        </div>
        {agent.enabled && (
          <Button variant="outline" size="sm" disabled={toggle.isPending} onClick={() => toggle.mutate(!agent.paused)}>
            {toggle.isPending ? <Spinner /> : agent.paused ? <PlayIcon /> : <PauseIcon />}{" "}
            {agent.paused ? "Resume" : "Pause"}
          </Button>
        )}
      </nav>

      <header className="mt-4 flex items-center gap-3">
        <AgentAvatar status={status} className="size-10" />
        <div className="space-y-1.5">
          <h1 className="text-2xl leading-none font-semibold tracking-tight">Volume spike alert</h1>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <StatusDot status={status} />
            <span>{agent.pools.map(poolName).join(", ") || "No pools"}</span>
          </p>
        </div>
      </header>
      {hint && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{hint}</p>}
      <FormError error={toggle.error} />

      {notice && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-brand/30 bg-brand/10 px-2.5 py-1.5 text-xs text-foreground/80">
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
        {tab === "alerts" && <AlertsTab agent={agent} now={now} />}
        {tab === "settings" && <SettingsTab agent={agent} onSaved={setNotice} />}
      </div>
    </div>
  );
}

/** The two token logos of a pool, overlapped; a letter stands in when they could not be looked up. */
function PairLogo({ tokens, name }: { tokens: PoolView["tokens"]; name: string }) {
  if (!tokens)
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
        {name.slice(0, 1)}
      </span>
    );
  return (
    <span className="flex shrink-0 items-center">
      <TokenIcon token={tokens[0]} className="relative z-10 size-8 text-xs ring-2 ring-card" />
      <TokenIcon token={tokens[1]} className="-ml-2.5 size-8 text-xs ring-2 ring-card" />
    </span>
  );
}

/** One alert: pair logos and time on the left, the numbers as labelled columns on the right. */
function AlertRow({ alert: a, tokens, now }: { alert: AlertView; tokens: PoolView["tokens"]; now: number }) {
  const name = a.poolLabel ?? shortAddr(a.poolAddress);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <PairLogo tokens={tokens} name={name} />
      <span className="min-w-0 flex-1 basis-32">
        <Link
          to="/analytics"
          search={{ pool: a.poolAddress }}
          className="block truncate text-sm font-medium hover:text-brand"
        >
          {name}
        </Link>
        <span className="block truncate text-xs whitespace-nowrap text-muted-foreground" title={utcStamp(a.at)}>
          {!a.delivered && (
            <span className="mr-1.5 text-loss" title={a.error ?? undefined}>
              {a.error ? "Not sent" : "Sending"}
            </span>
          )}
          {timeAgo(a.at, now)}
        </span>
      </span>
      <span className="grid shrink-0 grid-cols-3 gap-x-5 text-right tabular-nums">
        {[
          ["Volume 1m", compactUsd(a.vol1m), false],
          ["Median", compactUsd(a.baseline), false],
          ["Spike", ratioText(a.ratio), true],
        ].map(([label, value, strong]) => (
          <span key={String(label)} className="block min-w-14">
            <span className="block font-mono text-[0.6rem] tracking-[0.08em] text-muted-foreground uppercase">
              {label}
            </span>
            <span className={`mt-0.5 block text-sm font-semibold ${strong ? "text-brand" : ""}`}>{value}</span>
          </span>
        ))}
      </span>
    </li>
  );
}

function Overview({ agent, now }: { agent: AgentView; now: number }) {
  const { data } = useSuspenseQuery(alertsQuery);
  const edit = (
    <Link
      to="/agents/$agentId"
      params={{ agentId: agent.id }}
      search={{ tab: "settings" }}
      className="text-xs font-medium text-brand"
    >
      Edit
    </Link>
  );
  const recent = data.alerts.slice(0, 6);
  const tokensByPool = new Map(agent.pools.map((p) => [p.address, p.tokens]));
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Pools watched", String(agent.pools.length)],
          ["Alerts, 24h", String(agent.alerts24h)],
          ["Last alert", agent.lastAlertAt ? timeAgo(agent.lastAlertAt, now) : "None yet"],
          ["Cooldown", formatMinutes(agent.config.cooldownSec)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border bg-card px-4 py-3">
            <p className="font-mono text-[0.6rem] tracking-[0.08em] text-muted-foreground uppercase">{label}</p>
            <p className="mt-1.5 text-lg leading-none font-semibold">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <Card
          title="Recent alerts"
          action={
            <Link
              to="/agents/$agentId"
              params={{ agentId: agent.id }}
              search={{ tab: "alerts" }}
              className="text-xs font-medium text-brand"
            >
              View all
            </Link>
          }
        >
          {recent.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No alerts yet</p>
          ) : (
            <ul className="-my-1 divide-y">
              {recent.map((a) => (
                <AlertRow key={a.id} alert={a} tokens={tokensByPool.get(a.poolAddress) ?? null} now={now} />
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-3">
          <Card title="Rules" action={edit}>
            <Rows
              rows={[
                ["Spike", `≥ ${agent.config.mult}×`],
                ["Baseline", formatMinutes(agent.config.baseline * 60)],
                ["Min volume", compactUsd(agent.config.minUsd)],
                ["Cooldown", formatMinutes(agent.config.cooldownSec)],
              ]}
            />
          </Card>
          <Card title="Telegram">
            <TelegramPanel />
          </Card>
        </div>
      </div>
    </>
  );
}

function PoolsTab({ agent }: { agent: AgentView }) {
  const add = useAgentMutation(addAgentPoolFn);
  const remove = useAgentMutation(removeAgentPoolFn);
  return (
    <Card title="Watched pools">
      {agent.pools.length > 0 && (
        <ul className="divide-y border-b">
          {agent.pools.map((p) => (
            <li key={p.id}>
              <SelectedPool
                logo={<PairLogo tokens={p.tokens} name={poolName(p)} />}
                name={poolName(p)}
                address={p.address}
                actions={
                  <>
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
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
      <PoolPicker
        taken={agent.pools.map((p) => p.address)}
        count={agent.pools.length}
        busy={add.isPending}
        onPick={(pool) => add.mutate({ data: pool })}
      />
      <FormError error={add.error ?? remove.error} />
    </Card>
  );
}

function AlertsTab({ agent, now }: { agent: AgentView; now: number }) {
  const { data } = useSuspenseQuery(alertsQuery);
  const tokensByPool = new Map(agent.pools.map((p) => [p.address, p.tokens]));
  return (
    <Card title="Alert history">
      {data.alerts.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">No alerts yet</p>
      ) : (
        <ul className="-my-1 divide-y">
          {data.alerts.map((a) => (
            <AlertRow key={a.id} alert={a} tokens={tokensByPool.get(a.poolAddress) ?? null} now={now} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function SettingsTab({ agent, onSaved }: { agent: AgentView; onSaved: (message: string) => void }) {
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
        <div className="flex items-center justify-end gap-3">
          <Button
            size="sm"
            disabled={!result.ok || !dirty || save.isPending}
            onClick={() =>
              result.ok && save.mutate({ data: result.config }, { onSuccess: () => onSaved("Rule saved") })
            }
            className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
          >
            {save.isPending && <Spinner />}
            {save.isPending ? "Saving" : "Save rule"}
          </Button>
        </div>
        <FormError error={save.error} />
      </Card>
      <Card title="Agent">
        <div className="flex items-center justify-between gap-3 text-xs">
          <label htmlFor="agent-enabled" className="flex items-center gap-2 font-medium">
            Turned on
            {power.isPending && <Spinner className="size-3.5 text-muted-foreground" />}
          </label>
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
