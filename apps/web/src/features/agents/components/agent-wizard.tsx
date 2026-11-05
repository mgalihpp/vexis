import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { AlertCircleIcon, ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronRightIcon, ZapIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { compactUsd } from "@/features/portfolio/money";
import {
  AGENT_TYPES,
  type Draft,
  defaultDraft,
  draftIssues,
  formatMinutes,
  parseConfigFields,
  WIZARD_STEPS,
  type WizardStep,
} from "../agents";
import { createVolumeAgent } from "../agents.functions";
import { agentsQuery } from "../agents.queries";
import { ConfigForm, FormError, PoolPicker, TelegramPanel, useAgentMutation } from "./agent-ui";

const STEP_META: Record<WizardStep, { title: string; sub: string; heading: string; next: string }> = {
  agent: { title: "Agent", sub: "What it does", heading: "Choose an agent", next: "Continue to pools" },
  pools: { title: "Pools", sub: "Which pools to watch", heading: "Choose pools", next: "Continue to rules" },
  rules: { title: "Rules", sub: "When an alert fires", heading: "Alert rules", next: "Continue to review" },
  review: { title: "Review", sub: "Telegram and launch", heading: "Review and launch", next: "Launch agent" },
};

export function AgentWizard({ step }: { step: WizardStep }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const create = useAgentMutation(createVolumeAgent);
  const { data: fleet } = useSuspenseQuery(agentsQuery);
  // One agent per kind for now, so a kind the user already has cannot be added again.
  const added = new Set<string>(fleet.agents.map((a) => a.kind));
  const available = AGENT_TYPES.filter((t) => !added.has(t.kind));

  const go = (to: WizardStep) => navigate({ to: "/agents/new", search: { step: to } });
  const index = WIZARD_STEPS.indexOf(step);
  const issues = draftIssues(draft);
  const parsed = parseConfigFields(draft.fields);

  const launch = async () => {
    if (!parsed.ok) return;
    await create.mutateAsync({ data: { pools: draft.pools, config: parsed.config } });
    const { agents } = await qc.fetchQuery({ ...agentsQuery, staleTime: 0 });
    const agent = agents[0];
    if (agent) await navigate({ to: "/agents/$agentId", params: { agentId: agent.id }, search: { tab: "overview" } });
  };

  const canAdvance =
    step === "agent"
      ? available.length > 0
      : step === "pools"
        ? draft.pools.length > 0
        : step === "rules"
          ? parsed.ok
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
          <h2 className="mb-4 text-base font-semibold tracking-tight">{STEP_META[step].heading}</h2>

          <div className="space-y-4">
            {step === "agent" && <AgentStep added={added} />}
            {step === "pools" && <PoolsStep draft={draft} setDraft={setDraft} />}
            {step === "rules" && (
              <ConfigForm
                fields={draft.fields}
                errors={parsed.ok ? {} : parsed.errors}
                onChange={(key, value) => setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value } }))}
              />
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

function AgentStep({ added }: { added: Set<string> }) {
  return (
    <ul className="space-y-2">
      {AGENT_TYPES.map((t) => (
        <li key={t.kind}>
          <div
            className={`flex items-center gap-3 rounded-lg border px-3 py-3 ${
              added.has(t.kind) ? "opacity-60" : "border-brand/50 bg-brand/5"
            }`}
          >
            <span className="flex size-8 items-center justify-center rounded-lg border border-brand/25 bg-brand/10 text-brand">
              <ZapIcon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t.name}</span>
              <span className="block text-xs text-muted-foreground">{t.sub}</span>
            </span>
            {added.has(t.kind) ? (
              <span className="text-xs text-muted-foreground">Added</span>
            ) : (
              <span className="flex size-5 items-center justify-center rounded-full bg-brand text-brand-foreground">
                <CheckIcon className="size-3" />
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function PoolsStep({ draft, setDraft }: { draft: Draft; setDraft: (f: (d: Draft) => Draft) => void }) {
  return (
    <PoolPicker
      taken={draft.pools.map((p) => p.address)}
      count={draft.pools.length}
      onPick={(pool) => setDraft((d) => ({ ...d, pools: [...d.pools, pool] }))}
      onRemove={(address) => setDraft((d) => ({ ...d, pools: d.pools.filter((x) => x.address !== address) }))}
    />
  );
}

function ReviewStep({ draft, issues, onGo }: { draft: Draft; issues: string[]; onGo: (s: WizardStep) => void }) {
  const parsed = parseConfigFields(draft.fields);
  const c = parsed.ok ? parsed.config : null;
  const names = draft.pools.map((p) => p.label);
  const pools =
    names.length === 0
      ? "None"
      : names.length <= 2
        ? names.join(", ")
        : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  const rows: { label: string; value: string; step: WizardStep }[] = [
    { label: "Pools", value: pools, step: "pools" },
    { label: "Spike", value: c ? `\u2265 ${c.mult}\u00d7 the median` : "\u2014", step: "rules" },
    { label: "Baseline", value: c ? formatMinutes(c.baseline * 60) : "\u2014", step: "rules" },
    { label: "Minimum volume", value: c ? `${compactUsd(c.minUsd)} / min` : "\u2014", step: "rules" },
    { label: "Cooldown", value: c ? `${formatMinutes(c.cooldownSec)} per pool` : "\u2014", step: "rules" },
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
      <div className="overflow-hidden rounded-2xl bg-muted/40">
        <TelegramPanel />
      </div>
    </>
  );
}
