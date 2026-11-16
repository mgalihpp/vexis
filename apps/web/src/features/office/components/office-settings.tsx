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
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { FormError } from "@/features/agents/components/agent-ui";
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
  saveWalletSourceFn,
} from "../office.functions";
import { useOfficeMutation } from "./office-ui";

function Block({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t py-4 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="m-0 flex w-fit gap-0.5 rounded-lg border-0 bg-muted p-0.5">
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-md px-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${
            o.value === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </fieldset>
  );
}

/** Everything the owner sets: models, keys, wallet and guardrails. Every write is checked by its zod schema. */
export function OfficeSettings({ config }: { config: ConfigView }) {
  return (
    <div className="flex flex-col">
      <ModelsBlock config={config} />
      <KeysBlock config={config} />
      <WalletBlock config={config} />
      <GuardrailsBlock config={config} />
    </div>
  );
}

function ModelsBlock({ config }: { config: ConfigView }) {
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
    <Block
      title="Models"
      hint="The model each LLM agent runs on, priced per million tokens. Nothing is picked for you: an agent without a model does not run."
    >
      {LLM_AGENTS.map((agent) => {
        const m = draft[agent];
        return (
          <div key={agent} className="grid grid-cols-[5.5rem_minmax(0,6.5rem)_minmax(0,1fr)] items-center gap-1.5">
            <span className="text-xs font-medium">{AGENT_INFO[agent].name}</span>
            <NativeSelect
              size="sm"
              className="w-full"
              aria-label={`${AGENT_INFO[agent].name} provider`}
              value={m?.provider ?? ""}
              onChange={(e) => setProvider(agent, e.target.value)}
            >
              <NativeSelectOption value="">Not running</NativeSelectOption>
              {LLM_PROVIDERS.map((p) => (
                <NativeSelectOption key={p} value={p} disabled={modelsOf(p).length === 0}>
                  {PROVIDER_LABEL[p]}
                  {modelsOf(p).length === 0 ? " (no priced model)" : ""}
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
        );
      })}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!parsed.success || save.isPending}
          onClick={() =>
            parsed.success &&
            save.mutate({ data: { models: parsed.data } }, { onSuccess: () => toast.success("Models saved") })
          }
        >
          {save.isPending && <Spinner />}
          Save models
        </Button>
      </div>
      <FormError error={save.error} />
    </Block>
  );
}

function KeysBlock({ config }: { config: ConfigView }) {
  const source = useOfficeMutation(saveKeySourceFn);
  const missing = missingKeys(config);
  return (
    <Block
      title="API keys"
      hint="Vexis keys are billed under the admin's daily cap. Own keys are encrypted on the server, never shown again, and spend under your own daily LLM guardrail."
    >
      <Choice
        label="Key source"
        options={KEY_SOURCES.map((k) => ({ value: k, label: k === "vexis" ? "Vexis key" : "Own key" }))}
        value={config.keySource}
        disabled={source.isPending}
        onChange={(keySource) => source.mutate({ data: { keySource } })}
      />
      <FormError error={source.error} />
      {missing.length > 0 && (
        <p className="text-xs text-amber-500">
          No key saved for{" "}
          {missing.map((m) => `${PROVIDER_LABEL[m.provider]} (${AGENT_INFO[m.agent].name})`).join(", ")}; those agents
          do not run.
        </p>
      )}
      {LLM_PROVIDERS.map((p) => (
        <KeyRow key={p} provider={p} saved={config.savedKeys.includes(p)} />
      ))}
    </Block>
  );
}

function KeyRow({ provider, saved }: { provider: LlmProvider; saved: boolean }) {
  const [key, setKey] = useState("");
  const save = useOfficeMutation(saveLlmKeyFn);
  const remove = useOfficeMutation(removeLlmKeyFn);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="w-20 shrink-0 text-xs font-medium">{PROVIDER_LABEL[provider]}</span>
        {saved ? (
          <>
            <Badge variant="profit">Saved</Badge>
            <Button
              variant="ghost"
              size="xs"
              className="ml-auto"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ data: { provider } })}
            >
              Remove
            </Button>
          </>
        ) : (
          <form
            className="flex min-w-0 flex-1 gap-1.5"
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
            <Input
              type="password"
              autoComplete="off"
              aria-label={`${PROVIDER_LABEL[provider]} API key`}
              placeholder="Paste an API key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="h-7"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!key.trim() || save.isPending}>
              Save
            </Button>
          </form>
        )}
      </div>
      <FormError error={save.error ?? remove.error} />
    </div>
  );
}

function WalletBlock({ config }: { config: ConfigView }) {
  const source = useOfficeMutation(saveWalletSourceFn);
  const save = useOfficeMutation(saveOfficeWalletFn);
  const remove = useOfficeMutation(removeOfficeWalletFn);
  const [secretKey, setSecret] = useState("");
  const [rpcUrl, setRpc] = useState("");
  return (
    <Block
      title="Wallet"
      hint="The wallet the office would trade from. The MVP only simulates, so nothing is signed with it yet."
    >
      <Choice
        label="Wallet source"
        options={WALLET_SOURCES.map((w) => ({ value: w, label: w === "user" ? "Agent wallet" : "Office wallet" }))}
        value={config.walletSource}
        disabled={source.isPending}
        onChange={(walletSource) => source.mutate({ data: { walletSource } })}
      />
      <FormError error={source.error} />
      {config.walletSource === "user" ? (
        <p className="text-xs text-muted-foreground">
          {config.userWallet ? (
            <>
              Uses your auto-rebalance agent wallet{" "}
              <span className="font-mono text-foreground">{shortAddr(config.userWallet.publicKey)}</span>
              {config.userWallet.rpcHost && <> on {config.userWallet.rpcHost}</>}.
            </>
          ) : (
            "No agent wallet saved yet. Save one in an auto-rebalance agent's settings, or use an office wallet."
          )}
        </p>
      ) : null}
      {config.officeWallet ? (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Office wallet</span>
          <span className="font-mono">{shortAddr(config.officeWallet.publicKey)}</span>
          {config.officeWallet.rpcHost && <span className="text-muted-foreground">{config.officeWallet.rpcHost}</span>}
          <Button
            variant="ghost"
            size="xs"
            className="ml-auto"
            disabled={remove.isPending}
            onClick={() => remove.mutate(undefined)}
          >
            Remove
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-1.5"
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
          <Input
            type="password"
            autoComplete="off"
            aria-label="Office wallet secret key"
            placeholder="Office wallet secret key (base58)"
            value={secretKey}
            onChange={(e) => setSecret(e.target.value)}
          />
          <Input
            type="url"
            autoComplete="off"
            aria-label="RPC URL"
            placeholder="https:// mainnet RPC URL"
            value={rpcUrl}
            onChange={(e) => setRpc(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="self-start"
            disabled={!secretKey.trim() || !rpcUrl.trim() || save.isPending}
          >
            {save.isPending && <Spinner />}
            Save office wallet
          </Button>
        </form>
      )}
      <FormError error={save.error ?? remove.error} />
    </Block>
  );
}

const GUARDRAIL_FIELDS: { key: keyof Guardrails; label: string; unit: string; step: string }[] = [
  { key: "maxPositionPct", label: "Largest position", unit: "% of wallet SOL", step: "1" },
  { key: "maxActivePositions", label: "Active positions", unit: "at most", step: "1" },
  { key: "maxDailyLossPct", label: "Daily loss limit", unit: "% of the UTC day's start", step: "0.5" },
  { key: "solReserve", label: "SOL reserve", unit: "SOL always kept", step: "0.01" },
  { key: "cooldownSec", label: "Pool cooldown", unit: "seconds after an execution", step: "30" },
  { key: "maxConsecutiveFailures", label: "Failures before pause", unit: "in a row", step: "1" },
  { key: "approvalTtlSec", label: "Approval window", unit: "seconds", step: "60" },
  { key: "dailyLlmUsd", label: "Daily LLM budget", unit: "USD, own keys", step: "0.5" },
];

function GuardrailsBlock({ config }: { config: ConfigView }) {
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
    <Block title="Guardrails" hint="Hard rules checked in code before any proposal reaches you. Only you change them.">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.success)
            save.mutate({ data: { guardrails: parsed.data } }, { onSuccess: () => toast.success("Guardrails saved") });
        }}
      >
        {GUARDRAIL_FIELDS.map((f) => (
          <div key={f.key} className="grid grid-cols-[1fr_6.5rem] items-center gap-x-2 gap-y-0.5">
            <label htmlFor={`guardrail-${f.key}`} className="text-xs">
              {f.label}
              <span className="block text-[0.6875rem] text-muted-foreground">{f.unit}</span>
            </label>
            <Input
              id={`guardrail-${f.key}`}
              type="number"
              inputMode="decimal"
              step={f.step}
              value={draft[f.key] ?? ""}
              aria-invalid={Boolean(errors[f.key])}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              className="h-7 text-right tabular-nums"
            />
            {errors[f.key] && <span className="col-span-2 text-[0.6875rem] text-loss">{errors[f.key]}</span>}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={!parsed.success || save.isPending}>
            {save.isPending && <Spinner />}
            Save guardrails
          </Button>
        </div>
        <FormError error={save.error} />
      </form>
    </Block>
  );
}
