// The auto-rebalance agent's own pieces: its rule form, the wallet it manages, its overview and history.

import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { SolIcon } from "@/components/icons";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/features/portfolio/money";
import { useStamp } from "@/features/timezone/timezone";
import { shortAddr } from "@/lib/format";
import {
  agentStatus,
  describeFees,
  describeWidth,
  FEE_MODE_LABEL,
  FEE_MODES,
  type FeeMode,
  formatMinutes,
  modeLabel,
  pairName,
  parseRebalanceFields,
  REBALANCE_FAILURE_LIMIT,
  REBALANCE_STRATEGIES,
  type RebalanceAgentView,
  type RebalanceFields,
  type RebalanceView,
  rebalanceFields,
  SECRET_KEY_PATTERN,
  STATUS_LABEL,
  solText,
} from "../agents";
import {
  removeRebalanceWalletFn,
  saveAgentConfig,
  saveRebalanceRpcUrlFn,
  saveRebalanceWalletFn,
} from "../agents.functions";
import { rebalancesQuery, walletQuery } from "../agents.queries";
import { Delivery, Panel, PoolCell, StatCard } from "./agent-layout";
import {
  CUSTOM,
  FormError,
  minutesLabel,
  Segmented,
  SettingRow,
  STATUS_STYLE,
  TelegramPanel,
  useAgentMutation,
} from "./agent-ui";

// --- rule form ---------------------------------------------------------------------------------

const SLIPPAGE_PRESETS = [10, 50, 100, 300];
/** 0 stands for "keep the current width"; a real half width is at least 1. */
const WIDTH_PRESETS = [0, 10, 34, 69];
const COOLDOWN_PRESETS = [1, 5, 15, 60];
/** 0 stands for "off": fees are then claimed only when a rebalance does. */
const CLAIM_PRESETS = [0, 0.01, 0.05, 0.1];
const RESERVE_PRESETS = [0.05, 0.1, 0.2, 0.5];

/** What the agent wallet has to hold, shown under the reserve field and in the wallet panel. */
export const WALLET_NEEDS =
  "Keep about 0.1 to 0.2 SOL beyond the position for transaction and priority fees plus one-time rent: a new bin " +
  "array is about 0.07 SOL, a token account about 0.002 SOL.";

/** A preset row whose value lives in a form string; Custom turns into a number field in place. */
function PresetField({
  id,
  label,
  hint,
  value,
  presets,
  fmt,
  suffix,
  step = "1",
  error,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  presets: number[];
  fmt: (n: number) => string;
  suffix?: string;
  step?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const current = value.trim() === "" ? 0 : Number(value);
  const isPreset = presets.includes(current);
  const [customOn, setCustomOn] = useState(!isPreset);
  const [focus, setFocus] = useState(false);
  const custom = customOn || !isPreset;
  return (
    <SettingRow label={label} hint={hint} error={error}>
      <Segmented
        label={label}
        options={[...presets.map((v) => ({ value: v, label: fmt(v) })), { value: CUSTOM, label: "Custom" }]}
        value={custom ? CUSTOM : current}
        onChange={(v) => {
          if (v === CUSTOM) {
            setFocus(true);
            return setCustomOn(true);
          }
          setCustomOn(false);
          onChange(v === 0 && presets.includes(0) ? "" : String(v));
        }}
        custom={{ id, value, suffix, step, invalid: Boolean(error), autoFocus: focus, onChange }}
      />
    </SettingRow>
  );
}

/** The rebalance rule's fields. No frame of its own, like `ConfigForm`. */
export function RebalanceConfigForm({
  fields,
  errors,
  onChange,
}: {
  fields: RebalanceFields;
  errors: Partial<Record<keyof RebalanceFields, string>>;
  onChange: (patch: Partial<Omit<RebalanceFields, "dryRun">>) => void;
}) {
  return (
    <div className="@container divide-y divide-border">
      <SettingRow label="Strategy" hint="How liquidity is spread across the new range." error={errors.strategy}>
        <Segmented
          label="Strategy"
          options={REBALANCE_STRATEGIES.map((s, i) => ({ value: i, label: s === "BidAsk" ? "Bid-Ask" : s }))}
          value={REBALANCE_STRATEGIES.indexOf(fields.strategy)}
          onChange={(i) => onChange({ strategy: REBALANCE_STRATEGIES[i] ?? "Curve" })}
        />
      </SettingRow>
      <PresetField
        id="rb-width"
        label="Range width"
        hint="Bins on each side of the active bin after a rebalance. Same keeps the position's current width."
        value={fields.halfWidth}
        presets={WIDTH_PRESETS}
        fmt={(n) => (n === 0 ? "Same" : `±${n}`)}
        suffix="bins"
        error={errors.halfWidth}
        onChange={(halfWidth) => onChange({ halfWidth })}
      />
      <PresetField
        id="rb-slippage"
        label="Slippage"
        hint="Most the balancing swap may lose to price movement, in basis points."
        value={fields.slippageBps}
        presets={SLIPPAGE_PRESETS}
        fmt={(n) => `${n} bps`}
        suffix="bps"
        error={errors.slippageBps}
        onChange={(slippageBps) => onChange({ slippageBps })}
      />
      <PresetField
        id="rb-cooldown"
        label="Cooldown per pool"
        hint="After acting on a pool, wait this long before acting on it again."
        value={fields.cooldownMin}
        presets={COOLDOWN_PRESETS}
        fmt={minutesLabel}
        suffix="min"
        error={errors.cooldownMin}
        onChange={(cooldownMin) => onChange({ cooldownMin })}
      />
      <SettingRow
        label="Fees"
        hint="What happens to the fees a rebalance claims. Compound deposits them back into the new range; sweep swaps them to SOL."
        error={errors.feeMode}
      >
        <Segmented
          label="Fees"
          options={FEE_MODES.map((m, i) => ({ value: i, label: FEE_MODE_LABEL[m] }))}
          value={FEE_MODES.indexOf(fields.feeMode)}
          onChange={(i) => {
            const feeMode: FeeMode = FEE_MODES[i] ?? "keep";
            // Kept fees are never claimed in range, so a threshold would only be an error to clear.
            onChange(feeMode === "keep" ? { feeMode, feeClaimThresholdSol: "" } : { feeMode });
          }}
        />
      </SettingRow>
      {fields.feeMode !== "keep" && (
        <PresetField
          id="rb-claim"
          label="Claim in range"
          hint="Also claim while the position stays in range, once its unclaimed fees are worth this much. Needs a pool with SOL on one side."
          value={fields.feeClaimThresholdSol}
          presets={CLAIM_PRESETS}
          fmt={(n) => (n === 0 ? "Off" : `${n} SOL`)}
          suffix="SOL"
          step="0.01"
          error={errors.feeClaimThresholdSol}
          onChange={(feeClaimThresholdSol) => onChange({ feeClaimThresholdSol })}
        />
      )}
      <PresetField
        id="rb-reserve"
        label="SOL reserve"
        hint={`SOL the agent leaves in the wallet. ${WALLET_NEEDS} Live actions pause while the wallet holds less than this.`}
        value={fields.solReserve}
        presets={RESERVE_PRESETS}
        fmt={(n) => `${n} SOL`}
        suffix="SOL"
        step="0.01"
        error={errors.solReserve}
        onChange={(solReserve) => onChange({ solReserve })}
      />
    </div>
  );
}

/**
 * Preview or live. Turning live on asks first: from then on the agent signs and sends with the saved wallet without
 * asking again. Turning it off needs no confirmation.
 */
function ModeSetting({ dryRun, onChange }: { dryRun: boolean; onChange: (dryRun: boolean) => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <SettingRow
      label="Mode"
      hint="Preview records and reports each move. Live signs and sends it from the agent wallet."
    >
      <Segmented
        label="Mode"
        options={[
          { value: 0, label: "Preview" },
          { value: 1, label: "Live" },
        ]}
        value={dryRun ? 0 : 1}
        onChange={(v) => (v === 1 ? setConfirming(true) : onChange(true))}
      />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send real transactions?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  When a position leaves its range, the agent will withdraw it, swap to balance the two sides and
                  deposit it again around the active bin, signing with the saved wallet. Each move costs network and
                  priority fees, and the swap can lose up to the slippage you set.
                </p>
                <p>
                  Start with a small position in a separate hot wallet. After {REBALANCE_FAILURE_LIMIT} failures in a
                  row the agent pauses itself.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep preview</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => onChange(false)}>
              Turn live on
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingRow>
  );
}

export function RebalanceRuleSection({
  agent,
  onSaved,
  onDirty,
}: {
  agent: RebalanceAgentView;
  onSaved: (message: string) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const initial = rebalanceFields(agent.config);
  const [fields, setFields] = useState<RebalanceFields>(initial);
  const save = useAgentMutation(saveAgentConfig);
  const result = parseRebalanceFields(fields);
  const dirty = JSON.stringify(fields) !== JSON.stringify(initial);
  const update = (next: RebalanceFields) => {
    setFields(next);
    onDirty(JSON.stringify(next) !== JSON.stringify(initial));
  };
  return (
    <>
      <div className="@container divide-y divide-border p-4 sm:p-5">
        <div className="pb-4">
          <ModeSetting dryRun={fields.dryRun} onChange={(dryRun) => update({ ...fields, dryRun })} />
          {!fields.dryRun && (
            <p className="mt-3 flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
              <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>Live: out-of-range positions are rebalanced on-chain with the agent wallet, without asking.</span>
            </p>
          )}
        </div>
        <div className="pt-4">
          <RebalanceConfigForm
            fields={fields}
            errors={result.ok ? {} : result.errors}
            onChange={(patch) => update({ ...fields, ...patch })}
          />
        </div>
      </div>
      <footer className="flex flex-wrap items-center gap-3 border-t px-4 py-3 sm:px-5">
        <span className="mr-auto text-xs text-muted-foreground">{dirty && "You have unsaved changes"}</span>
        <FormError error={save.error} />
        <Button variant="ghost" size="sm" disabled={!dirty || save.isPending} onClick={() => update(initial)}>
          Reset
        </Button>
        <Button
          size="sm"
          disabled={!result.ok || !dirty || save.isPending}
          onClick={() =>
            result.ok &&
            save.mutate(
              { data: { agentId: agent.id, kind: "auto-rebalance", config: result.config } },
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

// --- wallet ------------------------------------------------------------------------------------

const INPUT =
  "h-8 min-w-0 flex-1 rounded-lg border bg-background/60 px-3 font-mono text-xs outline-none focus:border-brand/60";

const HINT = "text-xs leading-relaxed text-muted-foreground";

const RPC_HINT = (
  <p className={HINT}>
    Solana mainnet. A{" "}
    <a href="https://helius.dev" target="_blank" rel="noreferrer" className="text-brand hover:underline">
      Helius
    </a>{" "}
    URL is recommended: other RPCs send transactions without a priority fee. Stored encrypted; only the host is shown
    again.
  </p>
);

/** What has to be true on-chain before an agent can act, in the order the user does it. */
function BeforeTheAgentActs() {
  const steps: [string, string][] = [
    [
      "Open one position yourself.",
      "In each agent's pool, from this wallet. The agent moves it back into range but never opens one.",
    ],
    [
      "Leave 0.1 to 0.2 SOL spare.",
      "It pays transaction fees and one-time rent (a new bin array is about 0.07 SOL). Live actions pause while the wallet holds less than the agent's SOL reserve.",
    ],
  ];
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-xs font-medium">Before the agent can act</p>
      <ol className="space-y-2">
        {steps.map(([title, detail], i) => (
          <li key={title} className="flex gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.7rem] font-semibold tabular-nums">
              {i + 1}
            </span>
            <p className={HINT}>
              <span className="font-medium text-foreground">{title}</span> {detail}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

const isHttpsUrl = (v: string) => URL.canParse(v) && new URL(v).protocol === "https:";

/** Replaces only the RPC URL. Inline, under the host it replaces. */
function RpcForm({ onDone }: { onDone: () => void }) {
  const save = useAgentMutation((rpcUrl: string) => saveRebalanceRpcUrlFn({ data: { rpcUrl } }));
  const [url, setUrl] = useState("");
  return (
    <form
      className="space-y-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(url.trim(), { onSuccess: onDone });
      }}
    >
      <div className="flex items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://mainnet.helius-rpc.com/?api-key=…"
          aria-label="RPC URL"
          className={INPUT}
        />
        <Button
          type="submit"
          size="sm"
          className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
          disabled={save.isPending || !isHttpsUrl(url.trim())}
        >
          {save.isPending && <Spinner />}
          Save
        </Button>
      </div>
      <FormError error={save.error} />
    </form>
  );
}

/**
 * The wallet the agents manage and the RPC they use. The secret key and the RPC URL go to the server once and are
 * never shown again; only the public key and the RPC's host come back. No padding of its own, like `TelegramPanel`.
 */
export function WalletPanel() {
  const { data } = useSuspenseQuery(walletQuery);
  const save = useAgentMutation((input: { secretKey: string; rpcUrl: string }) =>
    saveRebalanceWalletFn({ data: input }),
  );
  const remove = useAgentMutation(() => removeRebalanceWalletFn());
  const [secret, setSecret] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [replacingRpc, setReplacingRpc] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const busy = save.isPending || remove.isPending;

  const submit = async () => {
    if (!SECRET_KEY_PATTERN.test(secret.trim())) {
      setInputError("That does not look like a base58 secret key");
      return;
    }
    if (!isHttpsUrl(rpcUrl.trim())) {
      setInputError("The RPC URL must start with https://");
      return;
    }
    setInputError(null);
    await save.mutateAsync({ secretKey: secret.trim(), rpcUrl: rpcUrl.trim() });
    setSecret("");
    setRpcUrl("");
  };

  const error = inputError ? (
    <p className="text-[0.7rem] text-loss">{inputError}</p>
  ) : (
    <FormError error={save.error ?? remove.error} />
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <SolIcon className="size-8 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Agent wallet</p>
          <p className="truncate text-xs text-muted-foreground">
            {data.publicKey ? <span className="font-mono">{shortAddr(data.publicKey)}</span> : "Not connected yet"}
          </p>
        </div>
        {data.publicKey && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove.mutate(undefined)}>
            {remove.isPending && <Spinner />}
            Remove
          </Button>
        )}
      </div>

      {data.publicKey ? (
        <div className="space-y-2 rounded-lg border px-3 py-2.5">
          <div className="flex items-center gap-3 text-xs">
            <span className="w-14 shrink-0 text-muted-foreground">RPC</span>
            <span
              className={`min-w-0 flex-1 truncate ${data.rpcHost ? "font-mono" : "text-amber-700 dark:text-amber-400"}`}
            >
              {data.rpcHost ?? "Not set. The agents wait until you add one."}
            </span>
            {data.rpcHost && !replacingRpc && (
              <Button variant="ghost" size="sm" onClick={() => setReplacingRpc(true)}>
                Replace
              </Button>
            )}
          </div>
          {(!data.rpcHost || replacingRpc) && (
            <>
              <RpcForm onDone={() => setReplacingRpc(false)} />
              {RPC_HINT}
            </>
          )}
        </div>
      ) : (
        <>
          <p className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Use a separate hot wallet that holds only these positions, never your main wallet. Its key is stored
              encrypted so the agent can sign without you.
            </span>
          </p>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit().catch(() => {});
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor="agent-wallet-secret" className="text-xs font-medium">
                Secret key
              </label>
              <input
                id="agent-wallet-secret"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={secret}
                onChange={(e) => {
                  setSecret(e.target.value);
                  setInputError(null);
                }}
                placeholder="Base58 private key"
                className={`${INPUT} w-full`}
              />
              <p className={HINT}>Exported from your wallet app. It is never shown again after you save.</p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="agent-wallet-rpc" className="text-xs font-medium">
                RPC URL
              </label>
              <input
                id="agent-wallet-rpc"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={rpcUrl}
                onChange={(e) => {
                  setRpcUrl(e.target.value);
                  setInputError(null);
                }}
                placeholder="https://mainnet.helius-rpc.com/?api-key=…"
                className={`${INPUT} w-full`}
              />
              {RPC_HINT}
            </div>
            <div className="flex items-center justify-end gap-3">
              <div className="min-w-0 flex-1">{error}</div>
              <Button
                type="submit"
                size="sm"
                className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
                disabled={busy || secret.trim() === "" || rpcUrl.trim() === ""}
              >
                {save.isPending && <Spinner />}
                Save wallet
              </Button>
            </div>
          </form>
        </>
      )}

      {data.publicKey && error}
      <BeforeTheAgentActs />
    </div>
  );
}

// --- overview and history ----------------------------------------------------------------------

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

export function RebalanceOverview({ agent, now }: { agent: RebalanceAgentView; now: number }) {
  const { data } = useSuspenseQuery(rebalancesQuery(agent.id));
  const [pool] = agent.pools;
  const status = agentStatus(agent);
  const c = agent.config;
  const tabLink = (tab: "settings" | "alerts", label: string) => (
    <Link
      to="/agents/$agentId"
      params={{ agentId: agent.id }}
      search={{ tab }}
      className="text-xs font-medium text-brand hover:underline"
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2 xl:grid-cols-5">
        <StatCard label="Status" value={STATUS_LABEL[status]} tone={STATUS_STYLE[status].text} />
        <StatCard label="Pool" value={pool ? pairName(pool) : "None"} />
        <StatCard label="Out of range, 24h" value={agent.alerts24h} />
        <StatCard label="Last out of range" value={agent.lastAlertAt ? timeAgo(agent.lastAlertAt, now) : "None yet"} />
        <StatCard label="Mode" value={modeLabel(c)} tone={c.dryRun ? "" : "text-brand"} />
      </div>
      <div className="grid gap-2 xl:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-2">
          <Panel title="Rebalance rule" action={tabLink("settings", "Edit")}>
            <Rows
              rows={[
                ["Strategy", c.strategy],
                ["Range width", describeWidth(c.halfWidth)],
                ["Slippage", `${c.slippageBps} bps`],
                ["Cooldown", formatMinutes(c.cooldownSec)],
                ["Fees", describeFees(c)],
                ["SOL reserve", solText(c.solReserve)],
              ]}
            />
          </Panel>
          <Panel title="Wallet">
            <div className="px-3.25 pb-3.25">
              <WalletPanel />
            </div>
          </Panel>
          <Panel title="Telegram">
            <div className="px-3.25 pb-3.25">
              <TelegramPanel kind="auto-rebalance" />
            </div>
          </Panel>
        </div>
        <Panel title="Recent rebalances" action={tabLink("alerts", "View all")} className="overflow-hidden">
          <p className="px-3.25 pb-2 text-xs text-muted-foreground">
            {c.dryRun
              ? "Preview: the agent records and reports each move; nothing is signed or sent."
              : "Live: the agent rebalances on-chain with the saved wallet and links each transaction."}
          </p>
          <div className="overflow-x-auto border-t">
            <RebalanceTable rows={data.rebalances.slice(0, 8)} feeMode={data.feeMode} now={data.now} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function RebalanceHistory({ agentId }: { agentId: string }) {
  const { data } = useSuspenseQuery(rebalancesQuery(agentId));
  return (
    <div className="-mx-2 overflow-x-auto">
      <RebalanceTable rows={data.rebalances} feeMode={data.feeMode} now={data.now} />
    </div>
  );
}

const TAG = "rounded px-1.5 py-0.5 text-[0.625rem]";

function Transaction({ row }: { row: RebalanceView }) {
  if (row.signature) {
    return (
      <a
        href={`https://solscan.io/tx/${row.signature}`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-brand hover:underline"
      >
        {shortAddr(row.signature)}
      </a>
    );
  }
  if (!row.live) return <span className={`${TAG} bg-muted text-muted-foreground`}>Preview</span>;
  if (row.txError) {
    return (
      <span title={row.txError} className={`${TAG} cursor-help bg-loss/10 text-loss`}>
        Failed
      </span>
    );
  }
  return <span className={`${TAG} bg-muted text-muted-foreground`}>Sending</span>;
}

/** A claim keeps the range, so its "new range" cell says what was claimed and what happened to it. */
function ClaimCell({ row, feeMode }: { row: RebalanceView; feeMode: FeeMode }) {
  const mode = feeMode === "sweep" ? "swept to SOL" : feeMode === "compound" ? "compounded" : null;
  return (
    <>
      Fees claimed
      <span className="block text-[0.625rem] font-normal text-muted-foreground">
        {[row.feeSol === null ? null : solText(row.feeSol), mode].filter(Boolean).join(", ")}
      </span>
    </>
  );
}

function RebalanceTable({ rows, feeMode, now }: { rows: RebalanceView[]; feeMode: FeeMode; now: number }) {
  const stamp = useStamp();
  return (
    <Table className="min-w-[44rem]">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="pl-3.25">Pool</TableHead>
          <TableHead className="text-right">Time</TableHead>
          <TableHead className="text-right">Active bin</TableHead>
          <TableHead className="text-right">Range</TableHead>
          <TableHead className="text-right">New range</TableHead>
          <TableHead className="text-right">Transaction</TableHead>
          <TableHead className="pr-3.25 text-right">Telegram</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="tabular-nums">
        {rows.length === 0 && (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
              No rebalances yet
            </TableCell>
          </TableRow>
        )}
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="pl-3.25">
              <PoolCell address={r.poolAddress} label={r.poolLabel} tokens={r.tokens} />
            </TableCell>
            <TableCell className="text-right">
              <div className="text-muted-foreground">{stamp(r.at, " at ")}</div>
              <div className="font-semibold">{timeAgo(r.at, now)}</div>
            </TableCell>
            <TableCell className="text-right font-medium">{r.activeBin}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {r.lowerBin} to {r.upperBin}
            </TableCell>
            <TableCell className="text-right font-semibold text-brand">
              {r.action === "claim" ? (
                <ClaimCell row={r} feeMode={feeMode} />
              ) : (
                <>
                  {r.newLowerBin} to {r.newUpperBin}
                </>
              )}
            </TableCell>
            <TableCell className="text-right">
              <Transaction row={r} />
            </TableCell>
            <TableCell className="pr-3.25 text-right">
              <Delivery alert={r} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
