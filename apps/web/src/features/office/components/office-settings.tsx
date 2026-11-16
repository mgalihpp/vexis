import {
  type AgentModel,
  Guardrails,
  KEY_SOURCES,
  LLM_AGENTS,
  LLM_PROVIDERS,
  type LlmAgent,
  type LlmProvider,
  modelsOf,
  OfficeModels,
  PROVIDER_LABEL,
  WALLET_SOURCES,
} from "@vexis/db/office";
import {
  BotIcon,
  BrainIcon,
  CoinsIcon,
  GlobeIcon,
  KeyRoundIcon,
  type LucideIcon,
  ShieldCheckIcon,
  WalletIcon,
  WavesIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Group, Row, RowIcon, SegmentedControl } from "@/components/grouped-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { errorText, FormError } from "@/features/agents/components/agent-ui";
import { PresetPicker } from "@/features/agents/components/screener-source";
import { useIsMobile } from "@/hooks/use-mobile";
import { shortAddr } from "@/lib/format";
import { AGENT_INFO, type ConfigView, missingKeys } from "../office";
import {
  removeLlmKeyFn,
  removeOfficeWalletFn,
  saveGuardrailsFn,
  saveKeySourceFn,
  saveLlmKeyFn,
  saveModelsFn,
  saveOfficeWalletFn,
  saveScreenFn,
  saveWalletSourceFn,
} from "../office.functions";
import { Portrait } from "./agent-card";
import { useOfficeMutation } from "./office-ui";

/** A small field inside an iOS row, the same look as the app Settings' number field. */
const FIELD =
  "h-7 min-w-0 rounded-md bg-foreground/[0.07] px-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring aria-invalid:ring-1 aria-invalid:ring-loss";

const icon = (Icon: LucideIcon) => (
  <RowIcon>
    <Icon />
  </RowIcon>
);

/** The page's save button, under its groups and aligned like an iOS form's action. */
function Save({ disabled, pending, children }: { disabled: boolean; pending: boolean; children: ReactNode }) {
  return (
    <Button type="submit" size="sm" disabled={disabled || pending} className="self-end">
      {pending && <Spinner />}
      {children}
    </Button>
  );
}

const SECTIONS = [
  { value: "models", label: "Models", Icon: BrainIcon, Page: ModelsPage },
  { value: "pools", label: "Pools", Icon: WavesIcon, Page: PoolsPage },
  { value: "keys", label: "API keys", Icon: KeyRoundIcon, Page: KeysPage },
  { value: "wallet", label: "Wallet", Icon: WalletIcon, Page: WalletPage },
  { value: "guardrails", label: "Guardrails", Icon: ShieldCheckIcon, Page: GuardrailsPage },
] as const;
type Section = (typeof SECTIONS)[number]["value"];

/**
 * Everything the owner sets: models, pools, keys, wallet and guardrails, laid out like the app's Settings dialog (a bottom
 * drawer with every section on phones). Every write is checked by its zod schema.
 */
export function OfficeSettings({
  config,
  open,
  onOpenChange,
}: {
  config: ConfigView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const [active, setActive] = useState<Section>("models");

  if (isMobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-[90dvh] data-[vaul-drawer-direction=bottom]:max-h-[90dvh]">
          <div className="flex h-12 shrink-0 items-center justify-center border-b px-4">
            <DrawerTitle className="text-sm font-semibold">Office settings</DrawerTitle>
            <DrawerDescription className="sr-only">Models, pools, keys, wallet and guardrails</DrawerDescription>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-4 pt-3 pb-8">
            {SECTIONS.map(({ value, label, Page }) => (
              <div key={value} className="flex flex-col gap-3">
                <h3 className="px-3 text-base font-semibold">{label}</h3>
                <Page config={config} />
              </div>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    );

  const current = SECTIONS.find((s) => s.value === active) ?? SECTIONS[0];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(46rem,90dvh)] flex-row gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <nav className="flex w-56 shrink-0 flex-col gap-1 border-r bg-muted/30 p-3">
          <DialogTitle className="px-2 pt-1 pb-3 text-sm font-semibold">Office settings</DialogTitle>
          <DialogDescription className="sr-only">Models, pools, keys, wallet and guardrails</DialogDescription>
          {SECTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              aria-current={active === value ? "page" : undefined}
              onClick={() => setActive(value)}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                active === value
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center border-b px-5 pr-12">
            <h2 className="text-sm font-semibold">{current.label}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6">
            <current.Page config={config} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PoolsPage({ config }: { config: ConfigView }) {
  const [preset, setPreset] = useState(config.screen.preset);
  const save = useOfficeMutation(saveScreenFn);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ data: { preset } }, { onSuccess: () => toast.success("Pool filter saved") });
      }}
    >
      <section className="flex flex-col gap-1.5">
        <h3 className="px-3 text-xs font-medium text-muted-foreground">Screener filter</h3>
        <PresetPicker
          selected={preset}
          custom={config.screen.custom}
          onPick={(id) => id !== "pools" && setPreset(id)}
          customHint="Filter the screener, then press “Scout pools like these” to hand the filter to the office."
        />
      </section>
      <FormError error={save.error} />
      <Save disabled={preset === config.screen.preset} pending={save.isPending}>
        Save pool filter
      </Save>
    </form>
  );
}

function ModelsPage({ config }: { config: ConfigView }) {
  if (config.keySource === "vexis")
    return (
      <Group title="Picked by Vexis" footer="Switch to own keys in API keys to choose models yourself.">
        {LLM_AGENTS.map((agent) => (
          <Row
            key={agent}
            icon={
              <RowIcon>
                <Portrait agent={agent} className="h-6 w-4" />
              </RowIcon>
            }
            label={AGENT_INFO[agent].name}
            description={config.models[agent] ? PROVIDER_LABEL[config.models[agent].provider] : "Not running"}
          >
            <span className="font-mono text-xs text-muted-foreground">{config.models[agent]?.model ?? "—"}</span>
          </Row>
        ))}
      </Group>
    );
  return <OwnModels config={config} />;
}

function OwnModels({ config }: { config: ConfigView }) {
  const [draft, setDraft] = useState<Record<LlmAgent, AgentModel | null>>(config.models);
  const save = useOfficeMutation(saveModelsFn);
  const parsed = OfficeModels.safeParse(draft);
  const setProvider = (agent: LlmAgent, provider: string) =>
    setDraft((d) => ({
      ...d,
      [agent]: provider
        ? { provider: provider as LlmProvider, model: modelsOf(provider as LlmProvider)[0] ?? "" }
        : null,
    }));
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed.success)
          save.mutate({ data: { models: parsed.data } }, { onSuccess: () => toast.success("Models saved") });
      }}
    >
      <Group title="Agents">
        {LLM_AGENTS.map((agent) => {
          const m = draft[agent];
          return (
            <Row
              key={agent}
              icon={
                <RowIcon>
                  <Portrait agent={agent} className="h-6 w-4" />
                </RowIcon>
              }
              label={AGENT_INFO[agent].name}
              description={m ? PROVIDER_LABEL[m.provider] : "Not running"}
            >
              <div className="grid w-64 shrink-0 grid-cols-[6.5rem_minmax(0,1fr)] gap-1.5">
                <NativeSelect
                  size="sm"
                  className="w-full"
                  aria-label={`${AGENT_INFO[agent].name} provider`}
                  value={m?.provider ?? ""}
                  onChange={(e) => setProvider(agent, e.target.value)}
                >
                  <NativeSelectOption value="">Off</NativeSelectOption>
                  {LLM_PROVIDERS.map((p) => (
                    <NativeSelectOption key={p} value={p} disabled={modelsOf(p).length === 0}>
                      {PROVIDER_LABEL[p]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <NativeSelect
                  size="sm"
                  className="w-full"
                  aria-label={`${AGENT_INFO[agent].name} model`}
                  disabled={!m}
                  value={m?.model ?? ""}
                  onChange={(e) => m && setDraft((d) => ({ ...d, [agent]: { ...m, model: e.target.value } }))}
                >
                  {!m && <NativeSelectOption value="">—</NativeSelectOption>}
                  {m &&
                    modelsOf(m.provider).map((id) => (
                      <NativeSelectOption key={id} value={id}>
                        {id}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </div>
            </Row>
          );
        })}
      </Group>
      <FormError error={save.error} />
      <Save disabled={!parsed.success} pending={save.isPending}>
        Save models
      </Save>
    </form>
  );
}

function KeysPage({ config }: { config: ConfigView }) {
  const source = useOfficeMutation(saveKeySourceFn);
  const missing = missingKeys(config);
  return (
    <div className="flex flex-col gap-5">
      <Group
        title="Billing"
        error={missing.length > 0}
        footer={
          missing.length > 0
            ? `No key for ${missing.map((m) => `${PROVIDER_LABEL[m.provider]} (${AGENT_INFO[m.agent].name})`).join(", ")}: those agents do not run.`
            : undefined
        }
      >
        <Row icon={icon(CoinsIcon)} label="Pay with">
          <SegmentedControl
            value={config.keySource}
            onChange={(keySource) => !source.isPending && source.mutate({ data: { keySource } })}
            options={KEY_SOURCES.map((k) => ({ value: k, label: k === "vexis" ? "Vexis key" : "Own keys" }))}
          />
        </Row>
      </Group>
      <FormError error={source.error} />
      {config.keySource === "own" && (
        <Group title="Own keys" footer="Encrypted on the server and never shown again.">
          {LLM_PROVIDERS.map((p) => (
            <KeyRow key={p} provider={p} saved={config.savedKeys.includes(p)} />
          ))}
        </Group>
      )}
    </div>
  );
}

function KeyRow({ provider, saved }: { provider: LlmProvider; saved: boolean }) {
  const [key, setKey] = useState("");
  const save = useOfficeMutation(saveLlmKeyFn);
  const remove = useOfficeMutation(removeLlmKeyFn);
  const error = save.error ?? remove.error;
  return (
    <Row
      icon={icon(KeyRoundIcon)}
      label={PROVIDER_LABEL[provider]}
      description={error ? <span className="text-loss">{errorText(error)}</span> : undefined}
    >
      {saved ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="profit">Saved</Badge>
          <Button
            variant="ghost"
            size="xs"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ data: { provider } })}
          >
            Remove
          </Button>
        </div>
      ) : (
        <form
          className="flex w-64 shrink-0 gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              { data: { provider, key } },
              {
                onSuccess: () => {
                  setKey("");
                  toast.success("Key saved");
                },
              },
            );
          }}
        >
          <input
            type="password"
            autoComplete="off"
            aria-label={`${PROVIDER_LABEL[provider]} API key`}
            placeholder="Paste a key"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className={`${FIELD} flex-1`}
          />
          <Button type="submit" size="xs" variant="outline" disabled={!key.trim() || save.isPending}>
            Save
          </Button>
        </form>
      )}
    </Row>
  );
}

function WalletPage({ config }: { config: ConfigView }) {
  const source = useOfficeMutation(saveWalletSourceFn);
  const save = useOfficeMutation(saveOfficeWalletFn);
  const remove = useOfficeMutation(removeOfficeWalletFn);
  const [secretKey, setSecret] = useState("");
  const [rpcUrl, setRpc] = useState("");
  const agentWallet = config.userWallet
    ? `${shortAddr(config.userWallet.publicKey)}${config.userWallet.rpcHost ? ` · ${config.userWallet.rpcHost}` : ""}`
    : "None saved yet. Add one in an auto-rebalance agent's settings.";
  return (
    <div className="flex flex-col gap-5">
      <Group title="Source" footer="Simulation only: nothing is signed with it yet.">
        <Row icon={icon(WalletIcon)} label="Trade from">
          <SegmentedControl
            value={config.walletSource}
            onChange={(walletSource) => !source.isPending && source.mutate({ data: { walletSource } })}
            options={WALLET_SOURCES.map((w) => ({ value: w, label: w === "user" ? "Agent wallet" : "Office wallet" }))}
          />
        </Row>
        {config.walletSource === "user" && <Row icon={icon(BotIcon)} label="Agent wallet" description={agentWallet} />}
      </Group>
      <FormError error={source.error} />

      {config.officeWallet ? (
        <Group title="Office wallet">
          <Row
            icon={icon(WalletIcon)}
            label={<span className="font-mono">{shortAddr(config.officeWallet.publicKey)}</span>}
            description={config.officeWallet.rpcHost ?? undefined}
          >
            <Button variant="ghost" size="xs" disabled={remove.isPending} onClick={() => remove.mutate(undefined)}>
              Remove
            </Button>
          </Row>
        </Group>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              { data: { secretKey, rpcUrl } },
              {
                onSuccess: () => {
                  source.reset();
                  setSecret("");
                  setRpc("");
                  toast.success("Wallet saved");
                },
              },
            );
          }}
        >
          <Group title="Office wallet" footer="Both are encrypted on the server and never shown again.">
            <Row icon={icon(KeyRoundIcon)} label="Secret key">
              <input
                type="password"
                autoComplete="off"
                aria-label="Office wallet secret key"
                placeholder="base58"
                value={secretKey}
                onChange={(e) => setSecret(e.target.value)}
                className={`${FIELD} w-64`}
              />
            </Row>
            <Row icon={icon(GlobeIcon)} label="RPC URL">
              <input
                type="url"
                autoComplete="off"
                aria-label="RPC URL"
                placeholder="https:// mainnet"
                value={rpcUrl}
                onChange={(e) => setRpc(e.target.value)}
                className={`${FIELD} w-64`}
              />
            </Row>
          </Group>
          <Save disabled={!secretKey.trim() || !rpcUrl.trim()} pending={save.isPending}>
            Save office wallet
          </Save>
        </form>
      )}
      <FormError error={save.error ?? remove.error} />
    </div>
  );
}

const GUARDRAIL_GROUPS: {
  title: string;
  fields: { key: keyof Guardrails; label: string; unit: string; step: string }[];
}[] = [
  {
    title: "Positions",
    fields: [
      { key: "maxPositionPct", label: "Largest position", unit: "% of wallet SOL", step: "1" },
      { key: "maxActivePositions", label: "Active positions", unit: "At most", step: "1" },
      { key: "solReserve", label: "SOL reserve", unit: "SOL always kept", step: "0.01" },
    ],
  },
  {
    title: "Limits",
    fields: [
      { key: "maxDailyLossPct", label: "Daily loss limit", unit: "% of the UTC day's start", step: "0.5" },
      { key: "maxConsecutiveFailures", label: "Failures before pause", unit: "In a row", step: "1" },
      { key: "dailyLlmUsd", label: "Daily LLM budget", unit: "USD, own keys", step: "0.5" },
    ],
  },
  {
    title: "Timing",
    fields: [
      { key: "cooldownSec", label: "Pool cooldown", unit: "Seconds after an execution", step: "30" },
      { key: "approvalTtlSec", label: "Approval window", unit: "Seconds", step: "60" },
    ],
  },
];
const GUARDRAIL_FIELDS = GUARDRAIL_GROUPS.flatMap((g) => g.fields);

function GuardrailsPage({ config }: { config: ConfigView }) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(GUARDRAIL_FIELDS.map((f) => [f.key, String(config.guardrails[f.key])])),
  );
  const save = useOfficeMutation(saveGuardrailsFn);
  const parsed = Guardrails.safeParse(
    Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, v.trim() === "" ? Number.NaN : Number(v)])),
  );
  const errors = parsed.success
    ? {}
    : Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (parsed.success)
          save.mutate({ data: { guardrails: parsed.data } }, { onSuccess: () => toast.success("Guardrails saved") });
      }}
    >
      {GUARDRAIL_GROUPS.map((g, i) => (
        <Group
          key={g.title}
          title={g.title}
          error={g.fields.some((f) => errors[f.key])}
          footer={
            g.fields.map((f) => errors[f.key] && `${f.label}: ${errors[f.key]}`).find(Boolean) ||
            (i === 0 ? "Checked in code before a proposal reaches you." : undefined)
          }
        >
          {g.fields.map((f) => (
            <Row key={f.key} label={<label htmlFor={`guardrail-${f.key}`}>{f.label}</label>} description={f.unit}>
              <input
                id={`guardrail-${f.key}`}
                type="number"
                inputMode="decimal"
                step={f.step}
                value={draft[f.key] ?? ""}
                aria-invalid={Boolean(errors[f.key])}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                className={`${FIELD} w-24 text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none`}
              />
            </Row>
          ))}
        </Group>
      ))}
      <FormError error={save.error} />
      <Save disabled={!parsed.success} pending={save.isPending}>
        Save guardrails
      </Save>
    </form>
  );
}
