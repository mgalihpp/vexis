import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronLeftIcon,
  RepeatIcon,
  SearchIcon,
  ShieldIcon,
  SproutIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { money } from "@/features/portfolio/money";
import { shortAddr } from "@/lib/format";
import { useAgents } from "@/stores/agents";
import {
  ACTIVE_BIN,
  agentFromDraft,
  binPrice,
  type Draft,
  defaultDraft,
  draftIssues,
  draftPool,
  draftRange,
  enabledGuardrails,
  guardrailRisk,
  NETWORK_FEE_SOL,
  POOLS,
  POSITION_RENT_SOL,
  positionEstimate,
  RANGE_PRESETS,
  SPOT_USD,
  STRATEGIES,
  type StrategyId,
  strategyLabel,
  uniqueId,
  WALLET,
  WALLET_MAX_USD,
  WIZARD_STEPS,
  type WizardStep,
} from "../agents";
import { PairIcons } from "./agent-ui";

const usd = (v: number) => money(v, "usd");

const STEP_META: Record<WizardStep, { title: string; hint: string }> = {
  strategy: { title: "Strategy", hint: "Pick a template" },
  market: { title: "Market & range", hint: "Pool and deposit" },
  automation: { title: "Automation", hint: "Rules and guardrails" },
  review: { title: "Review", hint: "Confirm and launch" },
};

export function AgentWizard({ step }: { step: WizardStep }) {
  const navigate = useNavigate();
  const add = useAgents((s) => s.add);
  const agents = useAgents((s) => s.agents);
  const [draft, setDraft] = useState<Draft>(() => defaultDraft());
  const patch = (change: Partial<Draft>) => setDraft((d) => ({ ...d, ...change }));
  const index = WIZARD_STEPS.indexOf(step);
  const go = (to: WizardStep) => navigate({ to: "/agents/new", search: { step: to } });
  const next = WIZARD_STEPS[index + 1];
  const back = WIZARD_STEPS[index - 1];

  const launch = () => {
    const id = uniqueId(
      draft.name,
      agents.map((a) => a.id),
    );
    add(agentFromDraft(draft, id));
    void navigate({ to: "/agents/$agentId", params: { agentId: id } });
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-4 md:px-6">
      <header className="flex items-start gap-3">
        <Button asChild variant="outline" size="icon-sm" aria-label="Back">
          <Link to="/agents">
            <ChevronLeftIcon />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg leading-tight font-semibold tracking-tight">New agent</h1>
        </div>
        <Button variant="outline" size="sm" className="hidden sm:inline-flex">
          Save draft
        </Button>
        <Button asChild variant="outline" size="icon-sm" aria-label="Close">
          <Link to="/agents">
            <XIcon />
          </Link>
        </Button>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)_17.5rem]">
        <aside className="hidden space-y-4 lg:block">
          <Stepper step={step} draft={draft} />
        </aside>

        <section className="rounded-xl border bg-card p-5">
          <p className="text-[0.6rem] font-semibold tracking-[0.14em] text-brand uppercase">
            Step {index + 1} of {WIZARD_STEPS.length}
          </p>
          {step === "strategy" && <StrategyStep draft={draft} patch={patch} />}
          {step === "market" && <MarketStep draft={draft} patch={patch} />}
          {step === "automation" && <AutomationStep draft={draft} patch={patch} />}
          {step === "review" && <ReviewStep draft={draft} patch={patch} go={go} />}

          <Footer
            step={step}
            draft={draft}
            onBack={back ? () => go(back) : undefined}
            onNext={next ? () => go(next) : launch}
          />
        </section>

        <aside className="space-y-3">
          <Summary step={step} draft={draft} />
        </aside>
      </div>
    </div>
  );
}

// --- chrome ------------------------------------------------------------------------------------

function Stepper({ step, draft }: { step: WizardStep; draft: Draft }) {
  const current = WIZARD_STEPS.indexOf(step);
  const range = draftRange(draft);
  const done: Record<WizardStep, string> = {
    strategy: strategyLabel(draft.strategy),
    market: `${draftPool(draft).pair} · ${range.lower}–${range.upper}`,
    automation: "Guardrails set",
    review: "",
  };
  return (
    <div>
      <p className="mb-3 text-[0.6rem] tracking-[0.14em] text-muted-foreground uppercase">Setup</p>
      <ol>
        {WIZARD_STEPS.map((s, i) => {
          const complete = i < current;
          const active = i === current;
          return (
            <li key={s} className="relative flex gap-2.5 pb-5 last:pb-0">
              {i < WIZARD_STEPS.length - 1 && <span className="absolute top-6 bottom-0 left-2.75 w-px bg-border" />}
              <span
                className={`z-10 flex size-5.5 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-semibold ${
                  active
                    ? "border-brand bg-brand text-brand-foreground"
                    : complete
                      ? "border-brand/40 bg-brand/10 text-brand"
                      : "bg-card text-muted-foreground"
                }`}
              >
                {complete ? <CheckIcon className="size-3" /> : i + 1}
              </span>
              <div>
                <p className={`text-xs font-medium ${active || complete ? "" : "text-muted-foreground"}`}>
                  {STEP_META[s].title}
                </p>
                <p className="text-[0.65rem] text-muted-foreground">{complete ? done[s] : STEP_META[s].hint}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Footer({
  step,
  draft,
  onBack,
  onNext,
}: {
  step: WizardStep;
  draft: Draft;
  onBack?: () => void;
  onNext: () => void;
}) {
  const issues = draftIssues(draft);
  const last = step === "review";
  const blocked = issues.length > 0 || (step === "automation" && !draft.acknowledged) || (last && !draft.acknowledged);
  const label = {
    strategy: "Continue to market",
    market: "Continue to automation",
    automation: "Review and launch",
    review: "Launch agent",
  }[step];
  return (
    <div className="mt-5 flex items-center justify-between gap-3">
      {onBack ? (
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
          <ArrowLeftIcon /> Back
        </Button>
      ) : (
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <Link to="/agents">Cancel</Link>
        </Button>
      )}
      <div className="flex items-center gap-3">
        {step === "market" && (
          <span className="hidden text-[0.65rem] text-muted-foreground sm:inline">
            Network fee ≈ {NETWORK_FEE_SOL} SOL
          </span>
        )}
        {issues[0] && <span className="text-[0.65rem] text-loss">{issues[0]}</span>}
        <Button
          disabled={blocked}
          onClick={onNext}
          className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
        >
          {last ? <CheckCircle2Icon /> : null}
          {label}
          {last ? null : <ArrowRightIcon />}
        </Button>
      </div>
    </div>
  );
}

const Heading = ({ title }: { title: string }) => (
  <h2 className="mt-1.5 mb-4 text-lg font-semibold tracking-tight">{title}</h2>
);

const FieldLabel = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className="mb-1.5 flex items-center justify-between text-xs">
    <span className="font-medium">{children}</span>
    {aside && <span className="font-mono text-[0.65rem] text-muted-foreground">{aside}</span>}
  </div>
);

type StepProps = { draft: Draft; patch: (c: Partial<Draft>) => void };

// --- step 1 ------------------------------------------------------------------------------------

const STRATEGY_ICON: Record<StrategyId, typeof RepeatIcon> = {
  "auto-rebalance": RepeatIcon,
  "range-guard": ShieldIcon,
  "fee-harvester": SproutIcon,
};

function StrategyStep({ draft, patch }: StepProps) {
  return (
    <>
      <Heading title="Choose a strategy" />
      <div role="radiogroup" aria-label="Strategy" className="space-y-2">
        {STRATEGIES.map((s) => {
          const Icon = STRATEGY_ICON[s.id];
          const selected = s.id === draft.strategy;
          return (
            // biome-ignore lint/a11y/useSemanticElements: styled card radio, arrow keys are not needed for three options
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => patch({ strategy: s.id })}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                selected ? "border-brand/50 bg-brand/8" : "hover:bg-muted/40"
              }`}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-md ${selected ? "bg-brand/15 text-brand" : "bg-muted text-muted-foreground"}`}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-xs font-medium">
                  {s.label}
                  {s.recommended && (
                    <span className="rounded-sm border border-brand/40 px-1 text-[0.5rem] font-semibold tracking-wider text-brand uppercase">
                      Recommended
                    </span>
                  )}
                </span>
              </span>
              <span
                className={`mt-1 flex size-3.5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-brand" : ""}`}
              >
                {selected && <span className="size-2 rounded-full bg-brand" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
        <label className="block">
          <FieldLabel>Agent name</FieldLabel>
          <span className="flex h-9 items-center rounded-md border bg-background px-2.5 focus-within:border-ring">
            <input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              maxLength={24}
              aria-label="Agent name"
              className="w-full bg-transparent text-xs outline-none"
            />
            <span className="font-mono text-[0.6rem] text-muted-foreground">
              {draft.name.trim().toLowerCase().replace(/\s+/g, "-")}
            </span>
          </span>
        </label>
        <div>
          <FieldLabel>Wallet</FieldLabel>
          <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-2.5 text-xs">
            <span className="font-medium">{WALLET.name}</span>
            <span className="font-mono text-[0.6rem] text-muted-foreground">{shortAddr(WALLET.address)}</span>
            <span className="ml-auto font-mono text-[0.6rem] text-muted-foreground">{WALLET.sol} SOL</span>
          </div>
        </div>
      </div>
    </>
  );
}

// --- step 2 ------------------------------------------------------------------------------------

function MarketStep({ draft, patch }: StepProps) {
  const pool = draftPool(draft);
  const range = draftRange(draft);
  const max = Math.floor(WALLET_MAX_USD());
  const setHalf = (half: number) => patch({ halfBins: Math.max(1, Math.min(60, half)), rangePreset: "custom" });
  const barStart = 0.2;
  const barEnd = 0.8;
  return (
    <>
      <Heading title="Choose market and range" />
      <FieldLabel
        aside={
          <span className="inline-flex items-center gap-1 font-sans text-brand">
            <SearchIcon className="size-3" /> Browse pools
          </span>
        }
      >
        Pool
      </FieldLabel>
      <div className="flex items-center gap-3 rounded-lg border bg-background p-3">
        <PairIcons pool={pool} size="size-6" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">{pool.pair}</p>
          <p className="text-[0.65rem] text-muted-foreground">
            Meteora DLMM · {pool.feePct}% fee · bin step {pool.binStep}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const i = POOLS.findIndex((p) => p.address === pool.address);
            patch({ poolAddress: (POOLS[(i + 1) % POOLS.length] ?? pool).address });
          }}
        >
          Change
        </Button>
      </div>

      <div className="mt-4">
        <FieldLabel aside={`Available ${WALLET.sol} SOL`}>Deposit</FieldLabel>
        <label className="flex items-baseline gap-2 rounded-lg border bg-background px-3 py-2.5 focus-within:border-brand/60">
          <span className="font-mono text-2xl font-semibold">$</span>
          <input
            inputMode="decimal"
            value={draft.depositUsd || ""}
            onChange={(e) => patch({ depositUsd: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })}
            aria-label="Deposit in USD"
            className="min-w-0 flex-1 bg-transparent font-mono text-2xl font-semibold outline-none"
          />
          <span className="text-[0.65rem] text-muted-foreground">USD</span>
        </label>
        <div className="mt-2 flex items-center gap-1.5">
          {[0.25, 0.5, 0.75, 1].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => patch({ depositUsd: Math.round(max * f) })}
              className="rounded-md border px-2 py-0.75 text-[0.65rem] text-muted-foreground hover:text-foreground"
            >
              {f === 1 ? "Max" : `${f * 100}%`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <FieldLabel aside={`${range.bins} bins · ${range.widthPct.toFixed(2)}% width`}>Range</FieldLabel>
        <div className="inline-flex rounded-md border p-0.5 text-[0.65rem]">
          {[...RANGE_PRESETS, { id: "custom", label: "Custom", halfBins: draft.halfBins }].map((p) => {
            const active = draft.rangePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  p.id === "custom"
                    ? patch({ rangePreset: "custom" })
                    : patch({ rangePreset: p.id as Draft["rangePreset"], halfBins: p.halfBins })
                }
                className={`rounded-[0.25rem] px-2.5 py-1 ${active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 rounded-lg border bg-background px-3 py-2.5">
          <div className="grid grid-cols-3 text-[0.6rem] text-muted-foreground tabular-nums">
            <span>{range.lower}</span>
            <span className="text-center font-mono text-foreground">active {ACTIVE_BIN}</span>
            <span className="text-right">{range.upper}</span>
          </div>
          <div className="relative my-1.5 h-1.5 rounded-full bg-muted">
            <span
              className="absolute inset-y-0 rounded-full bg-brand"
              style={{ left: `${barStart * 100}%`, width: `${(barEnd - barStart) * 100}%` }}
            />
            <span className="absolute top-1/2 left-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-foreground" />
          </div>
          <div className="grid grid-cols-3 text-[0.6rem] text-muted-foreground tabular-nums">
            <span>${binPrice(range.lower, pool.binStep).toFixed(2)}</span>
            <span className="text-center">${SPOT_USD.toFixed(2)} spot</span>
            <span className="text-right">${binPrice(range.upper, pool.binStep).toFixed(2)}</span>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <BinInput label="Lower bin" value={range.lower} onChange={(v) => setHalf(ACTIVE_BIN - v)} />
          <BinInput label="Upper bin" value={range.upper} onChange={(v) => setHalf(v - ACTIVE_BIN)} />
        </div>
      </div>
    </>
  );
}

function BinInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex h-9 items-center justify-between rounded-md border bg-background px-3 text-[0.65rem] tracking-wider text-muted-foreground uppercase focus-within:border-ring">
      {label}
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(/\D/g, ""));
          if (n) onChange(n);
        }}
        aria-label={label}
        className="w-16 bg-transparent text-right font-mono text-xs text-foreground outline-none"
      />
    </label>
  );
}

// --- step 3 ------------------------------------------------------------------------------------

function NumberField({
  label,
  unit,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="block rounded-lg border bg-background px-3 py-2 focus-within:border-ring">
      <span className="block text-[0.55rem] tracking-[0.1em] text-muted-foreground uppercase">{label}</span>
      <span className="mt-1 flex items-baseline justify-between gap-2">
        <input
          type="number"
          min={0}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-20 bg-transparent font-mono text-sm font-medium outline-none"
        />
        <span className="text-[0.6rem] text-muted-foreground">{unit}</span>
      </span>
    </label>
  );
}

function GuardRow({
  title,
  on,
  onToggle,
  value,
  unit,
  onValue,
}: {
  title: string;
  on: boolean;
  onToggle: (on: boolean) => void;
  value: number;
  unit: string;
  onValue: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
      <Switch checked={on} onCheckedChange={onToggle} aria-label={title} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{title}</p>
      </div>
      <label className="flex h-7 items-center gap-1 rounded-md border px-2 font-mono text-xs">
        <input
          type="number"
          min={0}
          value={value}
          disabled={!on}
          onChange={(e) => onValue(Number(e.target.value) || 0)}
          aria-label={`${title} value`}
          className="w-10 bg-transparent text-right outline-none disabled:opacity-50"
        />
        <span className="text-[0.55rem] text-muted-foreground">{unit}</span>
      </label>
    </div>
  );
}

function ToggleCard({ title, on, onToggle }: { title: string; on: boolean; onToggle: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
      <Switch checked={on} onCheckedChange={onToggle} aria-label={title} />
      <div>
        <p className="text-xs font-medium">{title}</p>
      </div>
    </div>
  );
}

function AutomationStep({ draft, patch }: StepProps) {
  return (
    <>
      <Heading title="Automation and guardrails" />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium">Rebalance rules</p>
        </div>
        <span className="rounded-sm border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[0.55rem] font-semibold text-brand">
          ● Always on
        </span>
      </div>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <NumberField
          label="When out of range for"
          unit="minutes"
          value={draft.outOfRangeMin}
          onChange={(v) => patch({ outOfRangeMin: v })}
        />
        <NumberField
          label="Max slippage"
          unit="percent"
          step={0.1}
          value={draft.slippagePct}
          onChange={(v) => patch({ slippagePct: v })}
        />
        <NumberField
          label="Cooldown between rebalances"
          unit="minutes"
          value={draft.cooldownMin}
          onChange={(v) => patch({ cooldownMin: v })}
        />
        <NumberField
          label="Max rebalances per day"
          unit="per day"
          value={draft.maxRebalancesPerDay}
          onChange={(v) => patch({ maxRebalancesPerDay: v })}
        />
      </div>

      <div className="mt-4 border-t pt-4">
        <p className="mb-2.5 text-xs font-medium">Risk guardrails</p>
        <div className="space-y-2">
          <GuardRow
            title="Stop-loss"
            on={draft.stopLoss.on}
            onToggle={(on) => patch({ stopLoss: { ...draft.stopLoss, on } })}
            value={draft.stopLoss.pct}
            unit="%"
            onValue={(pct) => patch({ stopLoss: { ...draft.stopLoss, pct } })}
          />
          <GuardRow
            title="Low SOL guard"
            on={draft.lowSol.on}
            onToggle={(on) => patch({ lowSol: { ...draft.lowSol, on } })}
            value={draft.lowSol.sol}
            unit="SOL"
            onValue={(sol) => patch({ lowSol: { ...draft.lowSol, sol } })}
          />
          <GuardRow
            title="Take-profit"
            on={draft.takeProfit.on}
            onToggle={(on) => patch({ takeProfit: { ...draft.takeProfit, on } })}
            value={draft.takeProfit.pct}
            unit="%"
            onValue={(pct) => patch({ takeProfit: { ...draft.takeProfit, pct } })}
          />
        </div>
      </div>

      <div className="mt-4 border-t pt-4">
        <p className="mb-2.5 text-xs font-medium">Fees and alerts</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleCard
            title="Auto-claim fees"
            on={draft.autoClaim.on}
            onToggle={(on) => patch({ autoClaim: { ...draft.autoClaim, on } })}
          />
          <ToggleCard title="Telegram alerts" on={draft.telegram} onToggle={(telegram) => patch({ telegram })} />
        </div>
        <Acknowledge
          id="ack-automation"
          checked={draft.acknowledged}
          onChange={(acknowledged) => patch({ acknowledged })}
          className="mt-3"
          text="I understand this agent can rebalance and claim fees without asking."
          link="How agents handle funds"
        />
      </div>
    </>
  );
}

function Acknowledge({
  id,
  checked,
  onChange,
  text,
  link,
  className = "",
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  text: string;
  link?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border bg-background px-3 py-2.5 text-[0.65rem] ${className}`}>
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      <label htmlFor={id}>
        {text} {link && <span className="text-brand">{link}</span>}
      </label>
    </div>
  );
}

// --- step 4 ------------------------------------------------------------------------------------

function ReviewStep({ draft, patch, go }: StepProps & { go: (s: WizardStep) => void }) {
  const pool = draftPool(draft);
  const range = draftRange(draft);
  const est = positionEstimate(draft);
  const rows: { label: string; value: ReactNode; detail: string; step: WizardStep }[] = [
    {
      label: "Strategy",
      value: strategyLabel(draft.strategy),
      detail: `Recentres when out of range for ${draft.outOfRangeMin} minutes`,
      step: "strategy",
    },
    {
      label: "Market",
      value: pool.pair,
      detail: `Meteora DLMM · ${pool.feePct}% fee · bin step ${pool.binStep}`,
      step: "market",
    },
    {
      label: "Range",
      value: `${range.lower} – ${range.upper}`,
      detail: `${range.bins} bins · ${range.widthPct.toFixed(2)}% width around the active bin`,
      step: "market",
    },
    {
      label: "Deposit",
      value: usd(draft.depositUsd),
      detail: `${est.sol.toFixed(2)} SOL + ${est.usdc.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC from ${WALLET.name}`,
      step: "market",
    },
    {
      label: "Guardrails",
      value: `${enabledGuardrails(draft)} enabled`,
      detail: [
        draft.stopLoss.on && `Stop-loss -${draft.stopLoss.pct}%`,
        draft.lowSol.on && `Low SOL ${draft.lowSol.sol}`,
        `${draft.maxRebalancesPerDay} rebalances/day`,
      ]
        .filter(Boolean)
        .join(" · "),
      step: "automation",
    },
    {
      label: "Alerts",
      value: draft.telegram ? "Telegram" : "Off",
      detail: "Rebalances, errors and pauses",
      step: "automation",
    },
  ];
  return (
    <>
      <Heading title="Review and launch" />
      <dl className="divide-y">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
            <div>
              <dt className="text-[0.55rem] tracking-[0.1em] text-muted-foreground uppercase">{r.label}</dt>
              <dd className="font-mono text-xs font-medium">{r.value}</dd>
            </div>
            <p className="text-[0.65rem] text-muted-foreground">{r.detail}</p>
            <button type="button" onClick={() => go(r.step)} className="text-[0.65rem] font-medium text-brand">
              Edit
            </button>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-center gap-3 rounded-lg border border-brand/30 bg-brand/8 px-3 py-2.5">
        <CheckCircle2Icon className="size-4 text-brand" />
        <div className="flex-1">
          <p className="text-xs font-medium">Dry run passed</p>
        </div>
        <span className="text-[0.65rem] font-medium text-brand">View log</span>
      </div>

      <div className="mt-2 flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
        <Switch
          checked={draft.observation}
          onCheckedChange={(observation) => patch({ observation })}
          aria-label="Observation mode"
        />
        <div className="flex-1">
          <p className="text-xs font-medium">Start in observation mode</p>
        </div>
        <span className="rounded-sm border px-1.5 py-0.5 text-[0.55rem] text-muted-foreground">Recommended</span>
      </div>

      <Acknowledge
        id="ack-review"
        checked={draft.acknowledged}
        onChange={(acknowledged) => patch({ acknowledged })}
        className="mt-2 border-0 bg-transparent px-0"
        text="I understand the agent can open, close and rebalance positions without asking, and that I can pause it at any time."
      />
    </>
  );
}

// --- summary rail ------------------------------------------------------------------------------

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-1.75 text-[0.65rem]">
      <span className="tracking-[0.08em] text-muted-foreground uppercase">{label}</span>
      <span className="truncate text-right font-mono text-foreground">{value}</span>
    </div>
  );
}

function Panel({
  title,
  sub,
  children,
  badge,
}: {
  title: string;
  sub?: string;
  children?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start justify-between px-3 py-2.5">
        <div>
          <p className="text-xs font-semibold">{title}</p>
          {sub && <p className="text-[0.6rem] text-muted-foreground">{sub}</p>}
        </div>
        {badge}
      </div>
      {children && <div className="divide-y border-t">{children}</div>}
    </div>
  );
}

function Summary({ step, draft }: { step: WizardStep; draft: Draft }) {
  const pool = draftPool(draft);
  const range = draftRange(draft);
  const est = positionEstimate(draft);
  const market = step !== "strategy";
  const automation = step === "automation" || step === "review";

  if (step === "automation") {
    const risk = guardrailRisk(draft);
    return (
      <Panel
        title="Guardrails"
        badge={
          <span className="rounded-sm border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-[0.55rem] font-semibold tracking-wider text-brand uppercase">
            {risk}
          </span>
        }
      >
        <SummaryRow label="Stop-loss" value={draft.stopLoss.on ? `-${draft.stopLoss.pct}% of deposit` : "Off"} />
        <SummaryRow label="Low SOL" value={draft.lowSol.on ? `${draft.lowSol.sol} SOL` : "Off"} />
        <SummaryRow label="Out of range" value={`${draft.outOfRangeMin} min`} />
        <SummaryRow label="Max slippage" value={`${draft.slippagePct.toFixed(1)}%`} />
        <SummaryRow label="Rebalance cap" value={`${draft.maxRebalancesPerDay} / day`} />
        <SummaryRow label="Alerts" value={draft.telegram ? "Telegram" : "Off"} />
      </Panel>
    );
  }

  if (step === "review") {
    const checks = [
      { ok: WALLET.sol >= 0.5, label: "Wallet funded", value: `${WALLET.sol} SOL` },
      { ok: range.bins >= 2, label: "Range valid", value: `${range.bins} bins` },
      { ok: enabledGuardrails(draft) > 0, label: "Guardrails set", value: `${enabledGuardrails(draft)} enabled` },
    ];
    const ready = checks.every((c) => c.ok);
    const deposit = est.sol;
    return (
      <>
        <Panel
          title={ready ? "Ready to launch" : "Not ready yet"}
          sub={ready ? "All checks passed" : "Fix the items below"}
          badge={<CheckCircle2Icon className={`size-4 ${ready ? "text-brand" : "text-muted-foreground"}`} />}
        >
          {checks.map((c) => (
            <div key={c.label} className="flex items-center justify-between px-3 py-1.75 text-[0.65rem]">
              <span className="flex items-center gap-1.5">
                {c.ok ? <CheckIcon className="size-3 text-profit" /> : <XIcon className="size-3 text-loss" />}
                {c.label}
              </span>
              <span className="font-mono">{c.value}</span>
            </div>
          ))}
        </Panel>
        <Panel title="At launch">
          <SummaryRow label="SOL deposit" value={`${deposit.toFixed(2)} SOL`} />
          <SummaryRow label="USDC deposit" value={est.usdc.toLocaleString("en-US", { maximumFractionDigits: 2 })} />
          <SummaryRow label="Network fee" value={`${NETWORK_FEE_SOL.toFixed(4)} SOL`} />
          <SummaryRow label="Position rent" value={`${POSITION_RENT_SOL.toFixed(3)} SOL`} />
          <SummaryRow
            label="Wallet after"
            value={`${(WALLET.sol - deposit - NETWORK_FEE_SOL - POSITION_RENT_SOL).toFixed(2)} SOL`}
          />
        </Panel>
      </>
    );
  }

  return (
    <Panel title="Agent summary">
      <SummaryRow label="Strategy" value={strategyLabel(draft.strategy)} />
      <SummaryRow label="Name" value={draft.name || "—"} />
      <SummaryRow label="Wallet" value={shortAddr(WALLET.address)} />
      <SummaryRow label="Pool" value={market ? pool.pair : "Not set"} />
      <SummaryRow label="Deposit" value={market ? usd(draft.depositUsd) : "$0.00"} />
      <SummaryRow label="Range" value={market ? `${range.lower} - ${range.upper}` : "Not set"} />
      {market && <SummaryRow label="Automation" value={automation ? "Set" : "Not set"} />}
      {market && (
        <div className="space-y-1.5 px-3 py-2.5">
          <p className="text-[0.55rem] tracking-[0.1em] text-muted-foreground uppercase">Position estimate</p>
          <div className="flex justify-between font-mono text-[0.65rem]">
            <span>{est.sol.toFixed(2)} SOL</span>
            <span>{est.usdc.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
            <span className="bg-violet-500" style={{ width: `${est.solShare * 100}%` }} />
            <span className="flex-1 bg-sky-500" />
          </div>
        </div>
      )}
    </Panel>
  );
}
