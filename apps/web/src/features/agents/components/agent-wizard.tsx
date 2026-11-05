import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type ConfigFields,
  type Draft,
  defaultDraft,
  describeRule,
  draftIssues,
  MAX_POOLS,
  parseConfigFields,
  WIZARD_STEPS,
  type WizardStep,
} from "../agents";
import { createVolumeAgent } from "../agents.functions";
import { agentsQuery } from "../agents.queries";
import { ConfigForm, FormError, PoolPicker, TelegramPanel, useAgentMutation } from "./agent-ui";

const STEP_META: Record<WizardStep, { title: string; hint: string }> = {
  pools: { title: "Pools", hint: "Which pools to watch" },
  rules: { title: "Rules", hint: "When an alert fires" },
  review: { title: "Review", hint: "Telegram and launch" },
};

export function AgentWizard({ step }: { step: WizardStep }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft>(defaultDraft);
  const create = useAgentMutation(createVolumeAgent);

  const go = (to: WizardStep) => navigate({ to: "/agents/new", search: { step: to } });
  const index = WIZARD_STEPS.indexOf(step);
  const issues = draftIssues(draft);
  const config = parseConfigFields(draft.fields);

  const launch = async () => {
    if (!config.ok) return;
    await create.mutateAsync({ data: { pools: draft.pools, config: config.config } });
    const { agents } = await qc.fetchQuery({ ...agentsQuery, staleTime: 0 });
    const agent = agents[0];
    if (agent) await navigate({ to: "/agents/$agentId", params: { agentId: agent.id }, search: { tab: "overview" } });
  };

  const canAdvance = step === "pools" ? draft.pools.length > 0 : step === "rules" ? config.ok : issues.length === 0;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-4 md:px-6">
      <nav className="text-[0.7rem] text-muted-foreground">
        <Link to="/agents" className="hover:text-foreground">
          ‹ Agents
        </Link>
      </nav>
      <h1 className="mt-2 text-2xl leading-none font-semibold tracking-tight">New volume alert</h1>

      <ol className="mt-4 flex gap-2 text-xs">
        {WIZARD_STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <button
              type="button"
              onClick={() => i <= index && go(s)}
              className={`w-full rounded-md border px-3 py-2 text-left ${
                s === step ? "border-brand/50 bg-brand/5" : "text-muted-foreground"
              } ${i > index ? "cursor-default" : ""}`}
            >
              <span className="block font-medium text-foreground">
                {i + 1}. {STEP_META[s].title}
              </span>
              <span className="block text-[0.65rem]">{STEP_META[s].hint}</span>
            </button>
          </li>
        ))}
      </ol>

      <section className="mt-4 space-y-4 rounded-lg border bg-card p-4">
        {step === "pools" && <PoolsStep draft={draft} setDraft={setDraft} />}
        {step === "rules" && (
          <RulesStep
            draft={draft}
            onChange={(key, value) => setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value } }))}
          />
        )}
        {step === "review" && <ReviewStep draft={draft} issues={issues} />}
        <FormError error={create.error} />
      </section>

      <footer className="mt-4 flex items-center justify-between">
        <Button variant="outline" disabled={index === 0} onClick={() => go(WIZARD_STEPS[index - 1] ?? "pools")}>
          <ArrowLeftIcon /> Back
        </Button>
        {step === "review" ? (
          <Button
            disabled={!canAdvance || create.isPending}
            onClick={launch}
            className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
          >
            {create.isPending ? "Creating…" : "Start watching"}
          </Button>
        ) : (
          <Button disabled={!canAdvance} onClick={() => go(WIZARD_STEPS[index + 1] ?? "review")}>
            Next <ArrowRightIcon />
          </Button>
        )}
      </footer>
    </div>
  );
}

function PoolsStep({ draft, setDraft }: { draft: Draft; setDraft: (f: (d: Draft) => Draft) => void }) {
  return (
    <>
      <div>
        <h2 className="text-sm font-semibold">Pools to watch</h2>
        <p className="text-xs text-muted-foreground">Up to {MAX_POOLS}. You can change them later.</p>
      </div>
      <PoolPicker
        taken={draft.pools.map((p) => p.address)}
        count={draft.pools.length}
        onPick={(pool) => setDraft((d) => ({ ...d, pools: [...d.pools, pool] }))}
      />
      {draft.pools.length === 0 ? (
        <p className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
          No pools picked yet.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {draft.pools.map((p) => (
            <li key={p.address} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="font-medium">{p.label}</span>
              <button
                type="button"
                aria-label={`Remove ${p.label}`}
                onClick={() => setDraft((d) => ({ ...d, pools: d.pools.filter((x) => x.address !== p.address) }))}
                className="text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function RulesStep({ draft, onChange }: { draft: Draft; onChange: (key: keyof ConfigFields, value: string) => void }) {
  const result = parseConfigFields(draft.fields);
  return (
    <>
      <div>
        <h2 className="text-sm font-semibold">When to alert</h2>
        <p className="text-xs text-muted-foreground">
          Volume in the last minute is compared with the median of the minutes before it.
        </p>
      </div>
      <ConfigForm fields={draft.fields} errors={result.ok ? {} : result.errors} onChange={onChange} />
      {result.ok && <p className="rounded-md bg-muted/50 px-3 py-2 text-xs">{describeRule(result.config)}</p>}
    </>
  );
}

function ReviewStep({ draft, issues }: { draft: Draft; issues: string[] }) {
  const config = parseConfigFields(draft.fields);
  return (
    <>
      <div>
        <h2 className="text-sm font-semibold">Review</h2>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-[8rem_1fr]">
        <dt className="text-muted-foreground">Pools</dt>
        <dd>{draft.pools.map((p) => p.label).join(", ") || "None"}</dd>
        <dt className="text-muted-foreground">Rule</dt>
        <dd>{config.ok ? describeRule(config.config) : "Fix the rules first"}</dd>
      </dl>
      {issues.length > 0 && (
        <ul className="space-y-0.5 text-xs text-loss">
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
      <div className="space-y-2 border-t pt-3">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <CheckIcon className="size-3.5 text-brand" /> Telegram
        </h3>
        <TelegramPanel />
      </div>
    </>
  );
}
