import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { BadgeCheckIcon, CheckIcon, SearchIcon, XIcon, ZapIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { findPools } from "@/features/analytics/analytics.functions";
import type { PoolSearchHit } from "@/features/analytics/analytics.types";
import { usePoolHits } from "@/features/analytics/components/pool-search";
import { TokenIcon } from "@/features/portfolio/components/pool-identity";
import { compactUsd, pct } from "@/features/portfolio/money";
import { shortAddr } from "@/lib/format";
import { type AgentStatus, BOT_TOKEN_PATTERN, type ConfigFields, MAX_POOLS, STATUS_LABEL } from "../agents";
import { connectTelegramBot, detectTelegramChat, disconnectTelegramLink } from "../agents.functions";
import { AGENTS_KEY, telegramQuery } from "../agents.queries";

export const STATUS_STYLE: Record<AgentStatus, { text: string; dot: string }> = {
  live: { text: "text-profit", dot: "bg-profit" },
  paused: { text: "text-muted-foreground", dot: "bg-muted-foreground" },
  attention: { text: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" },
  off: { text: "text-muted-foreground", dot: "bg-muted-foreground/50" },
};

const AVATAR_TONE: Record<AgentStatus, string> = {
  live: "bg-brand/10 text-brand border-brand/25",
  paused: "bg-muted text-muted-foreground border-border",
  attention: "bg-amber-500/10 text-amber-500 border-amber-500/25",
  off: "bg-muted text-muted-foreground border-border",
};

export function AgentAvatar({ status, className = "size-8" }: { status: AgentStatus; className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg border ${AVATAR_TONE[status]} ${className}`}>
      <ZapIcon className="size-4" />
    </span>
  );
}

export function StatusDot({ status }: { status: AgentStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[0.65rem] font-medium ${s.text}`}>
      <span className={`size-1.25 rounded-full ${s.dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export const poolName = (p: { label: string | null; address: string }) => p.label ?? shortAddr(p.address);

/** Runs a server write, then refreshes everything the agent pages read. */
export function useAgentMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: AGENTS_KEY }) });
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function FormError({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="text-[0.7rem] text-loss">{errorText(error)}</p>;
}

// --- pools -------------------------------------------------------------------------------------

const ROW =
  "grid w-full grid-cols-[minmax(0,1fr)_6rem_1.25rem] items-center gap-3 px-4 md:grid-cols-[minmax(0,1fr)_5rem_6rem_6rem_1.25rem]";

/** Pair, verified mark, and bin step / base fee as one muted line. */
function PoolCell({ hit }: { hit: PoolSearchHit }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="flex shrink-0 items-center">
        <TokenIcon token={hit.tokenX} className="relative z-10 size-8 text-xs ring-2 ring-card" />
        <TokenIcon token={hit.tokenY} className="-ml-2.5 size-8 text-xs ring-2 ring-card" />
      </span>
      <span className="min-w-0 space-y-0.5">
        <span className="flex items-center gap-1 text-[0.8rem] font-bold whitespace-nowrap">
          {hit.name}
          {hit.tokenX.verified && <BadgeCheckIcon aria-label="Verified" className="size-4 text-profit" />}
        </span>
        <span className="block truncate text-[0.7rem] text-muted-foreground tabular-nums">
          Bin step {hit.binStep} · Fee {pct(hit.baseFee / 100)}
        </span>
      </span>
    </span>
  );
}

function PoolRow({
  hit,
  picked,
  locked,
  maxVol,
  onClick,
}: {
  hit: PoolSearchHit;
  picked: boolean;
  locked: boolean;
  maxVol: number;
  onClick: () => void;
}) {
  return (
    <div
      className={`group relative ${ROW} py-3 text-left text-xs transition-colors ${
        locked ? "opacity-40" : ""
      } ${picked ? "bg-brand/[0.07] shadow-[inset_2px_0_0_var(--brand)]" : "hover:bg-muted/50"}`}
    >
      <button
        type="button"
        disabled={locked}
        aria-pressed={picked}
        aria-label={`${picked ? "Remove" : "Add"} ${hit.name}`}
        onClick={onClick}
        className="absolute inset-0"
      />
      <PoolCell hit={hit} />
      <span className="hidden text-right tabular-nums md:block">{compactUsd(hit.tvl)}</span>
      <span className="text-right">
        <span className="block font-medium tabular-nums">{compactUsd(hit.volume24h)}</span>
        <span className="mt-1 ml-auto block h-1 w-14 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-brand/70"
            style={{ width: `${Math.max(4, (hit.volume24h / maxVol) * 100)}%` }}
          />
        </span>
      </span>
      <span className="hidden text-right md:block">
        <span className="block font-medium tabular-nums">{compactUsd(hit.fees24h)}</span>
        <span className="block text-[0.65rem] text-muted-foreground tabular-nums">
          {hit.tvl > 0 ? pct(hit.fees24h / hit.tvl) : "\u2014"} of TVL
        </span>
      </span>
      <span
        aria-hidden
        className={`flex size-5 items-center justify-center rounded-full border transition-colors ${
          picked
            ? "border-brand bg-brand text-brand-foreground group-hover:border-loss group-hover:bg-loss"
            : "text-transparent group-hover:border-brand/60 group-hover:text-brand/60"
        }`}
      >
        {picked ? (
          <>
            <CheckIcon className="size-3 group-hover:hidden" />
            <XIcon className="hidden size-3 group-hover:block" />
          </>
        ) : (
          <CheckIcon className="size-3" />
        )}
      </span>
    </div>
  );
}

/** One chosen pool: logo, name, short address and actions, with a brand accent on the left. */
export function SelectedPool({
  logo,
  name,
  address,
  actions,
}: {
  logo: ReactNode;
  name: string;
  address: string;
  actions: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 pl-3 text-xs shadow-[inset_2px_0_0_var(--brand)]">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex shrink-0 items-center">{logo}</span>
        <span className="min-w-0">
          <span className="block text-[0.8rem] font-bold">{name}</span>
          <span className="block font-mono text-[0.7rem] text-muted-foreground">{shortAddr(address)}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-3">{actions}</span>
    </div>
  );
}

export function RemovePoolButton({
  name,
  onClick,
  pending = false,
  disabled = false,
}: {
  name: string;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={`Stop watching ${name}`}
      disabled={disabled}
      onClick={onClick}
      className="text-muted-foreground hover:text-loss disabled:opacity-50"
    >
      {pending ? <Spinner className="size-3.5" /> : <XIcon className="size-3.5" />}
    </button>
  );
}

/** Pool list to pick from: the busiest pools by default, narrowed by the search box. */
export function PoolPicker({
  taken,
  count,
  onPick,
  onRemove,
  busy = false,
}: {
  taken: string[];
  count: number;
  onPick: (pool: { address: string; label: string }) => void;
  /** When set, picked pools are pinned above the list and a click on one removes it. */
  onRemove?: (address: string) => void;
  busy?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [top, setTop] = useState<PoolSearchHit[]>([]);
  const [seen, setSeen] = useState<Record<string, PoolSearchHit>>({});
  const found = usePoolHits(query, true);
  useEffect(() => {
    let live = true;
    findPools({ data: { query: "" } })
      .then((r) => live && setTop(r))
      .catch(() => live && setTop([]));
    return () => {
      live = false;
    };
  }, []);
  const searching = query.trim().length > 0;
  const hits = (searching ? found : top).filter((h) => !taken.includes(h.address));
  const pinned = onRemove ? taken.map((a) => seen[a]).filter((h): h is PoolSearchHit => Boolean(h)) : [];
  const maxVol = Math.max(1, ...hits.map((h) => h.volume24h), ...pinned.map((h) => h.volume24h));
  const full = count >= MAX_POOLS;
  const label = "font-mono text-[0.6rem] tracking-[0.08em] uppercase";
  return (
    <div className="space-y-3">
      {pinned.length > 0 && (
        <ul className="divide-y border-b">
          {pinned.map((h) => (
            <li key={h.address}>
              <SelectedPool
                logo={
                  <>
                    <TokenIcon token={h.tokenX} className="relative z-10 size-8 text-xs ring-2 ring-card" />
                    <TokenIcon token={h.tokenY} className="-ml-2.5 size-8 text-xs ring-2 ring-card" />
                  </>
                }
                name={h.name}
                address={h.address}
                actions={<RemovePoolButton name={h.name} onClick={() => onRemove?.(h.address)} />}
              />
            </li>
          ))}
        </ul>
      )}
      <label className="flex h-10 items-center gap-2.5 rounded-lg border bg-background/60 px-3 focus-within:border-brand/60">
        {busy ? (
          <Spinner className="shrink-0 text-muted-foreground" />
        ) : (
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        )}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a pair or paste a pool address"
          aria-label="Search pools"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>
      <div>
        <div className={`${ROW} border-b py-2 ${label} text-muted-foreground`}>
          <span>{searching ? "Results" : "Top pools by volume"}</span>
          <span className="hidden text-right md:block">TVL</span>
          <span className="text-right">Vol 24h</span>
          <span className="hidden text-right md:block">Fees 24h</span>
          <span />
        </div>
        <ul className="max-h-[22rem] divide-y overflow-auto">
          {hits.map((h) => (
            <li key={h.address}>
              <PoolRow
                hit={h}
                picked={false}
                locked={full || busy}
                maxVol={maxVol}
                onClick={() => {
                  setSeen((m) => ({ ...m, [h.address]: h }));
                  onPick({ address: h.address, label: h.name });
                  if (!onRemove) setQuery("");
                }}
              />
            </li>
          ))}
          {hits.length === 0 && (
            <li className="px-4 py-6 text-center text-xs text-muted-foreground">
              {searching ? "No pools found" : "Loading\u2026"}
            </li>
          )}
        </ul>
      </div>
      <p className={`text-right ${label} text-muted-foreground`}>
        {count} of {MAX_POOLS} selected
      </p>
    </div>
  );
}

// --- config ------------------------------------------------------------------------------------

const BASELINE_PRESETS = [15, 30, 60, 180];
const MIN_USD_PRESETS = [1000, 5000, 10000, 25000, 100000];
const COOLDOWN_PRESETS = [1, 5, 15, 60];
const CUSTOM = -1;

const minutesLabel = (m: number) => (m >= 60 && m % 60 === 0 ? `${m / 60}h` : `${m}m`);
const usdLabel = (v: number) => (v >= 1000 ? `$${+(v / 1000).toFixed(1)}K` : `$${v}`);

type CustomField = {
  id: string;
  value: string;
  prefix?: string;
  suffix?: string;
  step: string;
  invalid: boolean;
  autoFocus: boolean;
  onChange: (value: string) => void;
};

/** The last column is wider so a typed value fits. */
const LAST_WEIGHT = 1.7;

/**
 * iOS-style segmented control: one thumb that slides under the chosen option. The option with
 * value CUSTOM becomes a number field inside the control once it is chosen.
 */
function Segmented({
  label,
  options,
  value,
  onChange,
  custom,
}: {
  label: string;
  options: { value: number; label: string }[];
  value: number;
  onChange: (value: number) => void;
  custom?: CustomField;
}) {
  const weights = options.map((_, i) => (i === options.length - 1 ? LAST_WEIGHT : 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const index = options.findIndex((o) => o.value === value);
  const offset = weights.slice(0, Math.max(index, 0)).reduce((sum, w) => sum + w, 0) / total;
  const share = (weights[index] ?? 1) / total;
  return (
    <fieldset
      className="relative m-0 grid min-w-0 rounded-[0.65rem] border-0 bg-black/35 p-0.5 dark:bg-black/40"
      style={{ gridTemplateColumns: weights.map((w) => `minmax(0, ${w}fr)`).join(" ") }}
    >
      <legend className="sr-only">{label}</legend>
      {index >= 0 && (
        <span
          aria-hidden
          className="absolute inset-y-0.5 rounded-[0.55rem] bg-foreground/[0.16] shadow-[0_1px_3px_rgba(0,0,0,0.35)] ring-1 ring-white/10 transition-[left,width] duration-200 ease-out"
          style={{ left: `calc(2px + (100% - 4px) * ${offset})`, width: `calc((100% - 4px) * ${share})` }}
        />
      )}
      {options.map((o) =>
        custom && o.value === CUSTOM && value === CUSTOM ? (
          <label
            key={o.value}
            htmlFor={custom.id}
            className={`relative z-10 flex h-8 items-center justify-center gap-0.5 rounded-[0.55rem] px-2 text-xs font-medium tabular-nums ${
              custom.invalid ? "text-loss" : "text-foreground"
            }`}
          >
            {custom.prefix}
            <input
              id={custom.id}
              type="number"
              inputMode="decimal"
              step={custom.step}
              value={custom.value}
              // biome-ignore lint/a11y/noAutofocus: focus moves here only after the user picked Custom
              autoFocus={custom.autoFocus}
              aria-invalid={custom.invalid}
              aria-label={label}
              onChange={(e) => custom.onChange(e.target.value)}
              className="w-full min-w-0 bg-transparent text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            {custom.suffix}
          </label>
        ) : (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={`relative z-10 h-8 rounded-[0.55rem] px-3 text-xs font-medium whitespace-nowrap tabular-nums transition-colors ${
              o.value === value ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ),
      )}
    </fieldset>
  );
}

const SLIDER =
  "h-7 w-full cursor-pointer appearance-none bg-transparent outline-none " +
  "[&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full " +
  "[&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--brand)_var(--p),var(--muted)_var(--p))] " +
  "[&::-webkit-slider-thumb]:-mt-[11px] [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none " +
  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white " +
  "[&::-webkit-slider-thumb]:shadow-[0_2px_6px_rgba(0,0,0,0.45)] " +
  "[&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full " +
  "[&::-moz-range-track]:bg-[linear-gradient(to_right,var(--brand)_var(--p),var(--muted)_var(--p))] " +
  "[&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 " +
  "[&::-moz-range-thumb]:bg-white focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-brand/40";

function SettingRow({
  label,
  right,
  error,
  inline = false,
  children,
}: {
  label: string;
  right?: ReactNode;
  error?: string;
  inline?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`px-4 py-3.5 ${inline ? "sm:flex sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-4" : ""}`}>
      <div className={`flex items-center justify-between gap-3 ${inline ? "mb-2.5 sm:mb-0 sm:h-8" : "mb-2"}`}>
        <span className="text-sm font-medium">{label}</span>
        {right}
      </div>
      <div className={inline ? "sm:w-[32rem]" : ""}>{children}</div>
      {error && <p className="mt-1.5 w-full text-right text-[0.7rem] text-loss">{error}</p>}
    </div>
  );
}

function PresetRow({
  label,
  field,
  presets,
  fields,
  error,
  fmt,
  prefix,
  suffix,
  step,
  onChange,
}: {
  label: string;
  field: "baseline" | "minUsd" | "cooldownMin";
  presets: number[];
  fields: ConfigFields;
  error?: string;
  fmt: (n: number) => string;
  prefix?: string;
  suffix?: string;
  step: string;
  onChange: (key: keyof ConfigFields, value: string) => void;
}) {
  const current = Number(fields[field]);
  const isPreset = fields[field] !== "" && presets.includes(current);
  const [customOn, setCustomOn] = useState(!isPreset);
  const [focus, setFocus] = useState(false);
  const custom = customOn || !isPreset;
  const options = [...presets.map((v) => ({ value: v, label: fmt(v) })), { value: CUSTOM, label: "Custom" }];
  return (
    <SettingRow label={label} inline error={error}>
      <Segmented
        label={label}
        options={options}
        value={custom ? CUSTOM : current}
        onChange={(v) => {
          if (v === CUSTOM) {
            setFocus(true);
            return setCustomOn(true);
          }
          setCustomOn(false);
          onChange(field, String(v));
        }}
        custom={{
          id: `cfg-${field}`,
          value: fields[field],
          prefix,
          suffix,
          step,
          invalid: Boolean(error),
          autoFocus: focus,
          onChange: (v) => onChange(field, v),
        }}
      />
    </SettingRow>
  );
}

const MULT_MIN = 1.5;
const MULT_MAX = 10;

export function ConfigForm({
  fields,
  errors,
  onChange,
}: {
  fields: ConfigFields;
  errors: Partial<Record<keyof ConfigFields, string>>;
  onChange: (key: keyof ConfigFields, value: string) => void;
}) {
  const mult = Number(fields.mult);
  const shown = Number.isFinite(mult) && mult > 0 ? mult : 3;
  const clamped = Math.min(MULT_MAX, Math.max(MULT_MIN, shown));
  const fill = ((clamped - MULT_MIN) / (MULT_MAX - MULT_MIN)) * 100;
  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl bg-muted/40">
      <SettingRow
        label="Spike multiplier"
        error={errors.mult}
        right={
          <label
            htmlFor="cfg-mult"
            className="flex items-baseline gap-0.5 font-mono text-base font-semibold text-brand tabular-nums"
          >
            <input
              id="cfg-mult"
              type="number"
              inputMode="decimal"
              step="0.5"
              value={fields.mult}
              aria-invalid={Boolean(errors.mult)}
              onChange={(e) => onChange("mult", e.target.value)}
              className="w-14 bg-transparent text-right outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            ×
          </label>
        }
      >
        <input
          type="range"
          min={MULT_MIN}
          max={MULT_MAX}
          step={0.5}
          value={clamped}
          aria-label="Spike multiplier"
          onChange={(e) => onChange("mult", e.target.value)}
          className={SLIDER}
          style={{ "--p": `${fill}%` } as React.CSSProperties}
        />
      </SettingRow>
      <PresetRow
        label="Baseline window"
        field="baseline"
        presets={BASELINE_PRESETS}
        fields={fields}
        error={errors.baseline}
        fmt={minutesLabel}
        suffix="min"
        step="1"
        onChange={onChange}
      />
      <PresetRow
        label="Minimum volume per minute"
        field="minUsd"
        presets={MIN_USD_PRESETS}
        fields={fields}
        error={errors.minUsd}
        fmt={usdLabel}
        prefix="$"
        step="100"
        onChange={onChange}
      />
      <PresetRow
        label="Cooldown per pool"
        field="cooldownMin"
        presets={COOLDOWN_PRESETS}
        fields={fields}
        error={errors.cooldownMin}
        fmt={minutesLabel}
        suffix="min"
        step="1"
        onChange={onChange}
      />
    </div>
  );
}

// --- telegram ----------------------------------------------------------------------------------

/** Telegram's paper plane on its blue disc. */
export function TelegramIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#26A5E4" />
      <path
        fill="#fff"
        d="M16.906 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"
      />
    </svg>
  );
}

/** Shows whether alerts have a chat to go to, and runs the one-time-code link flow when they do not. */
export function TelegramPanel({ children }: { children?: ReactNode }) {
  const { data: tg } = useSuspenseQuery(telegramQuery);
  const connect = useAgentMutation((token: string) => connectTelegramBot({ data: { token } }));
  const detect = useAgentMutation(() => detectTelegramChat());
  const disconnect = useAgentMutation(() => disconnectTelegramLink());
  const [token, setToken] = useState("");
  const [tokenError, setTokenError] = useState<string | null>(null);
  const bot = tg.bot;
  const busy = connect.isPending || detect.isPending || disconnect.isPending;
  const error = connect.error ?? detect.error ?? disconnect.error;

  const status = !bot
    ? tg.relink
      ? `The saved token for @${tg.relink} can no longer be read. Paste it again to resume alerts.`
      : "Not connected"
    : bot.linked
      ? `${bot.chatUsername ? `@${bot.chatUsername}` : "Your chat"} via @${bot.username}`
      : `@${bot.username} · waiting for /start`;

  const submitToken = async () => {
    if (!BOT_TOKEN_PATTERN.test(token.trim())) {
      setTokenError("That does not look like a bot token");
      return;
    }
    setTokenError(null);
    await connect.mutateAsync(token);
    setToken("");
  };

  return (
    <div className="divide-y divide-border">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3.5">
        <TelegramIcon className="size-9 shrink-0" />
        <span className="min-w-0 flex-1 basis-36">
          <span className="block text-sm font-medium">Telegram</span>
          <span
            className={`block text-xs ${!bot && tg.relink ? "text-amber-600 dark:text-amber-400" : "truncate text-muted-foreground"}`}
          >
            {status}
          </span>
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {bot && !bot.linked && (
            <Button
              size="sm"
              className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
              disabled={busy}
              onClick={() => detect.mutate(undefined)}
            >
              {detect.isPending && <Spinner />}
              Check
            </Button>
          )}
          {bot && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => disconnect.mutate(undefined)}>
              {disconnect.isPending && <Spinner />}
              {bot.linked ? "Unlink" : "Cancel"}
            </Button>
          )}
          {children}
        </span>
      </div>
      {!bot && (
        <form
          className="flex items-center gap-2 px-4 py-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            void submitToken().catch(() => {});
          }}
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            onChange={(e) => {
              setToken(e.target.value);
              setTokenError(null);
            }}
            placeholder="Bot token from @BotFather"
            aria-label="Bot token"
            className="h-8 min-w-0 flex-1 rounded-lg border bg-background/60 px-3 font-mono text-xs outline-none focus:border-brand/60"
          />
          <Button
            type="submit"
            size="sm"
            className="bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
            disabled={busy || token.trim() === ""}
          >
            {connect.isPending && <Spinner />}
            Connect
          </Button>
        </form>
      )}
      {bot && !bot.linked && (
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 text-xs">
          <span className="text-muted-foreground">
            Send <code className="font-mono text-foreground">/start</code> to the bot, then press Check
          </span>
          <a
            href={`https://t.me/${bot.username}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 font-medium text-brand"
          >
            <TelegramIcon className="size-4" /> Open @{bot.username}
          </a>
        </div>
      )}
      {(tokenError || error != null) && (
        <div className="px-4 py-2.5">
          {tokenError ? <p className="text-[0.7rem] text-loss">{tokenError}</p> : <FormError error={error} />}
        </div>
      )}
    </div>
  );
}
