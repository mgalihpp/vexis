// The auto-rebalance agent's own pieces: its rule form, the wallet it manages, its overview and history.

import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { TriangleAlertIcon, WalletIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { timeAgo } from "@/features/portfolio/money";
import { useStamp } from "@/features/timezone/timezone";
import { shortAddr } from "@/lib/format";
import {
  agentStatus,
  describeWidth,
  formatMinutes,
  parseRebalanceFields,
  REBALANCE_STRATEGIES,
  type RebalanceAgentView,
  type RebalanceFields,
  type RebalanceView,
  rebalanceFields,
  SECRET_KEY_PATTERN,
  STATUS_LABEL,
} from "../agents";
import { removeRebalanceWalletFn, saveAgentConfig, saveRebalanceWalletFn } from "../agents.functions";
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

/** A preset row whose value lives in a form string; Custom turns into a number field in place. */
function PresetField({
  id,
  label,
  hint,
  value,
  presets,
  fmt,
  suffix,
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
        custom={{ id, value, suffix, step: "1", invalid: Boolean(error), autoFocus: focus, onChange }}
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
  onChange: (key: keyof RebalanceFields, value: string) => void;
}) {
  return (
    <div className="@container divide-y divide-border">
      <SettingRow label="Strategy" hint="How liquidity is spread across the new range." error={errors.strategy}>
        <Segmented
          label="Strategy"
          options={REBALANCE_STRATEGIES.map((s, i) => ({ value: i, label: s === "BidAsk" ? "Bid-Ask" : s }))}
          value={REBALANCE_STRATEGIES.indexOf(fields.strategy)}
          onChange={(i) => onChange("strategy", REBALANCE_STRATEGIES[i] ?? "Curve")}
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
        onChange={(v) => onChange("halfWidth", v)}
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
        onChange={(v) => onChange("slippageBps", v)}
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
        onChange={(v) => onChange("cooldownMin", v)}
      />
    </div>
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
      <div className="p-4 sm:p-5">
        <RebalanceConfigForm
          fields={fields}
          errors={result.ok ? {} : result.errors}
          onChange={(key, value) => update({ ...fields, [key]: value })}
        />
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
              { data: { kind: "auto-rebalance", config: result.config } },
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

/**
 * The wallet the agent manages. The secret key goes to the server once and is never shown again; only the public
 * key comes back. No padding of its own, like `TelegramPanel`.
 */
export function WalletPanel() {
  const { data } = useSuspenseQuery(walletQuery);
  const save = useAgentMutation((secretKey: string) => saveRebalanceWalletFn({ data: { secretKey } }));
  const remove = useAgentMutation(() => removeRebalanceWalletFn());
  const [secret, setSecret] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const busy = save.isPending || remove.isPending;

  const submit = async () => {
    if (!SECRET_KEY_PATTERN.test(secret.trim())) {
      setInputError("That does not look like a base58 secret key");
      return;
    }
    setInputError(null);
    await save.mutateAsync(secret.trim());
    setSecret("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <WalletIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-medium">
            {data.publicKey ? shortAddr(data.publicKey) : "No wallet"}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {data.publicKey
              ? "Its funded position in each pool is kept in range"
              : "The agent needs a wallet to manage"}
          </p>
        </div>
        {data.publicKey && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => remove.mutate(undefined)}>
            {remove.isPending && <Spinner />}
            Remove
          </Button>
        )}
      </div>

      {!data.publicKey && (
        <>
          <p className="flex gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Use a separate hot wallet that holds only the positions this agent manages, never your main wallet. The
              key is stored encrypted on the Vexis server so the agent can act without you.
            </span>
          </p>
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void submit().catch(() => {});
            }}
          >
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={secret}
              onChange={(e) => {
                setSecret(e.target.value);
                setInputError(null);
              }}
              placeholder="Wallet secret key (base58)"
              aria-label="Wallet secret key"
              className="h-8 min-w-0 flex-1 rounded-lg border bg-background/60 px-3 font-mono text-xs outline-none focus:border-brand/60"
            />
            <Button
              type="submit"
              size="sm"
              className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
              disabled={busy || secret.trim() === ""}
            >
              {save.isPending && <Spinner />}
              Save
            </Button>
          </form>
        </>
      )}

      {inputError ? (
        <p className="text-[0.7rem] text-loss">{inputError}</p>
      ) : (
        <FormError error={save.error ?? remove.error} />
      )}
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
  const { data } = useSuspenseQuery(rebalancesQuery);
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
        <StatCard label="Pools" value={agent.pools.length} />
        <StatCard label="Out of range, 24h" value={agent.alerts24h} />
        <StatCard label="Last out of range" value={agent.lastAlertAt ? timeAgo(agent.lastAlertAt, now) : "None yet"} />
        <StatCard label="Mode" value="Preview" />
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
              <TelegramPanel />
            </div>
          </Panel>
        </div>
        <Panel title="Recent rebalances" action={tabLink("alerts", "View all")} className="overflow-hidden">
          <p className="px-3.25 pb-2 text-xs text-muted-foreground">
            Preview only: the agent records and reports the move, nothing is signed or sent yet.
          </p>
          <div className="overflow-x-auto border-t">
            <RebalanceTable rows={data.rebalances.slice(0, 8)} now={data.now} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function RebalanceHistory() {
  const { data } = useSuspenseQuery(rebalancesQuery);
  return (
    <div className="-mx-2 overflow-x-auto">
      <RebalanceTable rows={data.rebalances} now={data.now} />
    </div>
  );
}

function RebalanceTable({ rows, now }: { rows: RebalanceView[]; now: number }) {
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
              {r.newLowerBin} to {r.newUpperBin}
            </TableCell>
            <TableCell className="text-right">
              {r.signature ? (
                <a
                  href={`https://solscan.io/tx/${r.signature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-brand hover:underline"
                >
                  {shortAddr(r.signature)}
                </a>
              ) : (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] text-muted-foreground">Preview</span>
              )}
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
