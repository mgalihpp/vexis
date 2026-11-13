import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  CoinsIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { compactUsd } from "@/features/portfolio/money";
import {
  AGENT_TYPES,
  type AgentKind,
  COMING_SOON,
  type Draft,
  defaultDraft,
  describeFees,
  describeWidth,
  draftConfig,
  draftIssues,
  editableFields,
  formatMinutes,
  managedPools,
  needsPools,
  type PoolFilter,
  parseRebalanceFields,
  poolLimit,
  presetLabel,
  solText,
  spikeRule,
  WIZARD_STEPS,
  type WizardStep,
} from "../agents";
import { createAgentFn } from "../agents.functions";
import { agentsQuery, walletQuery } from "../agents.queries";
import { ConfigForm, FormError, PoolPicker, TelegramPanel, useAgentMutation } from "./agent-ui";
import { RebalanceConfigForm, WalletPanel } from "./rebalance-ui";
import { PresetRule, SourcePicker } from "./screener-source";

const STEP_META: Record<WizardStep, { title: string; sub: string; heading: string; next: string }> = {
  agent: { title: "Agent", sub: "What it does", heading: "Choose an agent", next: "Continue to pools" },
  pools: { title: "Pools", sub: "Which pools to watch", heading: "Choose pools", next: "Continue to rules" },
  rules: { title: "Rules", sub: "When an alert fires", heading: "Alert rules", next: "Continue to review" },
  review: { title: "Review", sub: "Telegram and launch", heading: "Review and launch", next: "Launch agent" },
};

/** `custom` is a filter handed over by the screener's "Alert on pools like these". */
export function AgentWizard({ step, custom }: { step: WizardStep; custom: PoolFilter | null }) {
  const navigate = useNavigate();
  const create = useAgentMutation(createAgentFn);
  const { data: fleet } = useSuspenseQuery(agentsQuery);
  const { data: wallet } = useSuspenseQuery(walletQuery);
  // One volume-watch agent per user; auto-rebalance agents are one per pool, so that kind is always available.
  const added = new Set<string>(fleet.agents.flatMap((a) => (a.kind === "volume-watch" ? [a.kind] : [])));
  const managed = managedPools(fleet.agents);
  const available = AGENT_TYPES.filter((t) => !added.has(t.kind));
  const [draft, setDraft] = useState<Draft>(() => defaultDraft(available[0]?.kind, custom));

  // Search params other than `step` (the screener's filter) are only read once, into the draft.
  const go = (to: WizardStep) => navigate({ to: "/agents/new", search: { step: to } });
  const index = WIZARD_STEPS.indexOf(step);
  const issues = draftIssues(draft, { wallet: wallet.publicKey, rpcHost: wallet.rpcHost, managed });
  const rebalance = draft.kind === "auto-rebalance";
  const rulesOk = rebalance ? parseRebalanceFields(draft.rebalanceFields).ok : draftConfig(draft).ok;
  const sourceOk = !(draft.source.source === "screener" && draft.source.preset === "custom" && !draft.source.custom);

  const launch = async () => {
    let created: { id: string };
    if (rebalance) {
      const parsed = parseRebalanceFields(draft.rebalanceFields);
      if (!parsed.ok) return;
      created = await create.mutateAsync({
        data: { kind: "auto-rebalance", pools: draft.pools, config: parsed.config },
      });
    } else {
      const parsed = draftConfig(draft);
      if (!parsed.ok) return;
      created = await create.mutateAsync({ data: { kind: "volume-watch", pools: draft.pools, config: parsed.config } });
    }
    await navigate({ to: "/agents/$agentId", params: { agentId: created.id }, search: { tab: "overview" } });
  };

  const canAdvance =
    step === "agent"
      ? !added.has(draft.kind)
      : step === "pools"
        ? needsPools(draft)
          ? draft.pools.length > 0 && !draft.pools.some((p) => rebalance && managed.has(p.address))
          : sourceOk
        : step === "rules"
          ? rulesOk
          : issues.length === 0;
  const back = () => go(WIZARD_STEPS[Math.max(index - 1, 0)] ?? "agent");

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-4 md:px-6">
      <nav className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/agents" className="flex items-center gap-1 hover:text-foreground">
          <ArrowLeftIcon className="size-3.5" /> Agents
        </Link>
        <ChevronRightIcon className="size-3" />
        <span className="text-foreground">New agent</span>
      </nav>
      <h1 className="mt-3 text-[1.375rem] leading-none font-semibold tracking-tight">New agent</h1>

      <div className="mt-5 space-y-4">
        <Stepper step={step} index={index} onGo={go} />

        <section className="flex flex-col">
          <h2 className="mb-4 text-base font-semibold tracking-tight">
            {rebalance && step === "rules"
              ? "Rebalance rule"
              : rebalance && step === "pools"
                ? "Choose the pool"
                : STEP_META[step].heading}
          </h2>

          <div className="space-y-4">
            {step === "agent" && (
              <AgentStep
                added={added}
                selected={draft.kind}
                onSelect={(kind) => setDraft((d) => ({ ...d, kind, pools: d.pools.slice(0, poolLimit(kind)) }))}
              />
            )}
            {step === "pools" && <PoolsStep draft={draft} managed={managed} setDraft={setDraft} />}
            {step === "rules" && rebalance && (
              <RebalanceConfigForm
                fields={draft.rebalanceFields}
                errors={(() => {
                  const r = parseRebalanceFields(draft.rebalanceFields);
                  return r.ok ? {} : r.errors;
                })()}
                onChange={(patch) => setDraft((d) => ({ ...d, rebalanceFields: { ...d.rebalanceFields, ...patch } }))}
              />
            )}
            {step === "rules" && !rebalance && (
              <>
                {draft.source.source === "screener" && draft.source.preset !== "custom" && (
                  <PresetRule config={draft.source} />
                )}
                <ConfigForm
                  fields={draft.fields}
                  editable={editableFields(draft.source)}
                  errors={(() => {
                    const r = draftConfig(draft);
                    return r.ok ? {} : r.errors;
                  })()}
                  onChange={(key, value) => setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value } }))}
                />
              </>
            )}
            {step === "review" && <ReviewStep draft={draft} issues={issues} onGo={go} />}
            <FormError error={create.error} />
          </div>

          <footer className="mt-auto flex items-center justify-between pt-6">
            {index > 0 ? (
              <Button variant="ghost" size="sm" onClick={back}>
                <ArrowLeftIcon /> Back
              </Button>
            ) : (
              <span />
            )}
            {step === "review" ? (
              <Button
                size="sm"
                disabled={!canAdvance || create.isPending}
                onClick={launch}
                className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
              >
                {create.isPending && <Spinner />}
                {create.isPending ? "Creating" : STEP_META.review.next}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!canAdvance}
                onClick={() => go(WIZARD_STEPS[index + 1] ?? "review")}
                className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
              >
                {STEP_META[step].next} <ArrowRightIcon />
              </Button>
            )}
          </footer>
        </section>
      </div>
    </div>
  );
}

function Stepper({ step, index, onGo }: { step: WizardStep; index: number; onGo: (s: WizardStep) => void }) {
  return (
    <nav aria-label="Setup steps" className="border-b pb-5">
      <ol className="flex items-center">
        {WIZARD_STEPS.map((s, i) => {
          const done = i < index;
          const current = s === step;
          const last = i === WIZARD_STEPS.length - 1;
          return (
            <li key={s} className={`flex items-center ${last ? "" : "flex-1"}`}>
              <button
                type="button"
                disabled={i > index}
                onClick={() => onGo(s)}
                aria-current={current ? "step" : undefined}
                className="flex shrink-0 items-center gap-2.5 text-left disabled:cursor-default"
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                    done
                      ? "border-brand bg-brand text-brand-foreground"
                      : current
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  {done ? <CheckIcon className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={`text-sm ${current ? "font-semibold text-foreground" : done ? "font-medium text-foreground" : "text-muted-foreground"} ${
                    current ? "" : "hidden sm:inline"
                  }`}
                >
                  {STEP_META[s].title}
                </span>
              </button>
              {!last && (
                <span
                  aria-hidden
                  className={`mx-3 flex-1 sm:mx-4 ${done ? "h-0.5 rounded-full bg-brand" : "border-t-2 border-dashed border-border"}`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function AgentStep({
  added,
  selected,
  onSelect,
}: {
  added: Set<string>;
  selected: AgentKind;
  onSelect: (kind: AgentKind) => void;
}) {
  return (
    <ul className="space-y-2">
      {AGENT_TYPES.map((t) => (
        <li key={t.kind}>
          <button
            type="button"
            disabled={added.has(t.kind)}
            aria-pressed={selected === t.kind}
            onClick={() => onSelect(t.kind)}
            className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left ${
              added.has(t.kind)
                ? "opacity-60"
                : selected === t.kind
                  ? "border-brand/50 bg-brand/5"
                  : "hover:bg-muted/40"
            }`}
          >
            <span className="flex size-8 items-center justify-center rounded-lg border border-brand/25 bg-brand/10 text-brand">
              {t.kind === "auto-rebalance" ? <RefreshCwIcon className="size-4" /> : <ZapIcon className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t.name}</span>
              <span className="block text-xs text-muted-foreground">{t.sub}</span>
            </span>
            {added.has(t.kind) ? (
              <span className="text-xs text-muted-foreground">Added</span>
            ) : selected === t.kind ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground">
                <CheckIcon className="size-3" />
              </span>
            ) : (
              <span className="size-5 rounded-full border" />
            )}
          </button>
        </li>
      ))}
      {COMING_SOON.map((t, i) => {
        const Icon = [ShieldCheckIcon, CoinsIcon][i] ?? ZapIcon;
        return (
          <li key={t.name}>
            <div className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-3 opacity-60">
              <span className="flex size-8 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{t.name}</span>
                <span className="block text-xs text-muted-foreground">{t.sub}</span>
              </span>
              <span className="rounded-full border px-2 py-0.5 text-[0.65rem] text-muted-foreground">Coming soon</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PoolsStep({
  draft,
  managed,
  setDraft,
}: {
  draft: Draft;
  managed: ReadonlySet<string>;
  setDraft: (f: (d: Draft) => Draft) => void;
}) {
  const max = poolLimit(draft.kind);
  return (
    <>
      {max === 1 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          An auto-rebalance agent manages the one funded position the agent wallet holds in one pool. Pools another
          agent already manages are left out.
        </p>
      )}
      {draft.kind === "volume-watch" && (
        <SourcePicker value={draft.source} onChange={(source) => setDraft((d) => ({ ...d, source }))} />
      )}
      {needsPools(draft) && (
        <PoolPicker
          taken={draft.pools.map((p) => p.address)}
          hidden={max === 1 ? [...managed] : []}
          count={draft.pools.length}
          max={max}
          onPick={(pool) => setDraft((d) => ({ ...d, pools: max === 1 ? [pool] : [...d.pools, pool] }))}
          onRemove={(address) => setDraft((d) => ({ ...d, pools: d.pools.filter((x) => x.address !== address) }))}
        />
      )}
    </>
  );
}

function ruleRows(draft: Draft): { label: string; value: string }[] {
  const dash = "\u2014";
  if (draft.kind === "auto-rebalance") {
    const parsed = parseRebalanceFields(draft.rebalanceFields);
    const c = parsed.ok ? parsed.config : null;
    return [
      { label: "Strategy", value: c ? c.strategy : dash },
      { label: "Range width", value: c ? describeWidth(c.halfWidth) : dash },
      { label: "Slippage", value: c ? `${c.slippageBps} bps` : dash },
      { label: "Cooldown", value: c ? formatMinutes(c.cooldownSec) : dash },
      { label: "Fees", value: c ? describeFees(c) : dash },
      { label: "SOL reserve", value: c ? solText(c.solReserve) : dash },
    ];
  }
  const parsed = draftConfig(draft);
  const c = parsed.ok ? parsed.config : null;
  const r = c && spikeRule(c);
  return [
    { label: "Spike", value: r ? `\u2265 ${r.mult}\u00d7 the median` : dash },
    { label: "Baseline", value: r ? formatMinutes(r.baseline * 60) : dash },
    { label: "Minimum volume", value: r ? `${compactUsd(r.minUsd)} / min` : dash },
    { label: "Cooldown", value: c ? `${formatMinutes(c.cooldownSec)} per pool` : dash },
  ];
}

function ReviewStep({ draft, issues, onGo }: { draft: Draft; issues: string[]; onGo: (s: WizardStep) => void }) {
  const names = draft.pools.map((p) => p.label);
  const pools = !needsPools(draft)
    ? `${presetLabel(draft.source.preset)} screener pools`
    : names.length === 0
      ? "None"
      : names.length <= 2
        ? names.join(", ")
        : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  const rows: { label: string; value: string; step: WizardStep }[] = [
    { label: draft.kind === "auto-rebalance" ? "Pool" : "Pools", value: pools, step: "pools" },
    ...ruleRows(draft).map((r) => ({ ...r, step: "rules" as const })),
  ];
  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-muted/40">
        {rows.map((r) => (
          <li key={r.label}>
            <button
              type="button"
              onClick={() => onGo(r.step)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60"
            >
              <span className="text-sm font-medium">{r.label}</span>
              <span className="ml-auto min-w-0 truncate text-sm text-muted-foreground">{r.value}</span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground/60" />
            </button>
          </li>
        ))}
      </ul>
      {issues.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-2xl border border-loss/30 bg-loss/10 px-4 py-3 text-sm text-loss"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <ul className="space-y-0.5">
            {issues.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      )}
      {draft.kind === "auto-rebalance" && (
        <div className="rounded-2xl bg-muted/40 p-4">
          <WalletPanel />
        </div>
      )}
      <div className="rounded-2xl bg-muted/40 p-4">
        <TelegramPanel kind={draft.kind} />
      </div>
    </>
  );
}
