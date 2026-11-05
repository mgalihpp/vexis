import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { CheckIcon, SendIcon, ZapIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePoolHits } from "@/features/analytics/components/pool-search";
import { compactUsd } from "@/features/portfolio/money";
import { shortAddr } from "@/lib/format";
import { type AgentStatus, type ConfigFields, MAX_POOLS, STATUS_LABEL } from "../agents";
import { beginTelegramLink } from "../agents.functions";
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

/** Searches Meteora pools by pair or address; picking a hit hands it back and clears the box. */
export function PoolPicker({
  taken,
  count,
  onPick,
  busy = false,
}: {
  taken: string[];
  count: number;
  onPick: (pool: { address: string; label: string }) => void;
  busy?: boolean;
}) {
  const [query, setQuery] = useState("");
  const hits = usePoolHits(query, true).filter((h) => !taken.includes(h.address));
  const full = count >= MAX_POOLS;
  return (
    <div className="space-y-1.5">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={full}
        placeholder={full ? `Limit of ${MAX_POOLS} pools reached` : "Search a pair or paste a pool address"}
        aria-label="Search pools"
      />
      {hits.length > 0 && (
        <ul className="max-h-64 overflow-auto rounded-md border bg-card p-1">
          {hits.map((h) => (
            <li key={h.address}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onPick({ address: h.address, label: h.name });
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
              >
                <span className="truncate font-medium">
                  {h.name} <span className="text-muted-foreground">bin {h.binStep}</span>
                </span>
                <span className="shrink-0 text-[0.7rem] text-muted-foreground">
                  TVL {compactUsd(h.tvl)} · Vol {compactUsd(h.volume24h)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- config ------------------------------------------------------------------------------------

const FIELDS: { key: keyof ConfigFields; label: string; hint: string; unit: string; step: string }[] = [
  {
    key: "mult",
    label: "Spike multiplier",
    hint: "Alert when a minute is at least this many times the median.",
    unit: "×",
    step: "0.5",
  },
  {
    key: "baseline",
    label: "Baseline window",
    hint: "Minutes of history in the median (3 to 1440). The agent waits until it has this many.",
    unit: "min",
    step: "1",
  },
  {
    key: "minUsd",
    label: "Minimum volume",
    hint: "Ignore minutes below this, so a quiet pool cannot trigger on dust.",
    unit: "USD",
    step: "100",
  },
  {
    key: "cooldownMin",
    label: "Cooldown per pool",
    hint: "Quiet time after an alert for the same pool.",
    unit: "min",
    step: "1",
  },
];

export function ConfigForm({
  fields,
  errors,
  onChange,
}: {
  fields: ConfigFields;
  errors: Partial<Record<keyof ConfigFields, string>>;
  onChange: (key: keyof ConfigFields, value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1">
          <label htmlFor={`cfg-${f.key}`} className="block text-xs font-medium">
            {f.label}
          </label>
          <span className="flex items-center gap-2">
            <Input
              id={`cfg-${f.key}`}
              type="number"
              inputMode="decimal"
              step={f.step}
              value={fields[f.key]}
              aria-invalid={Boolean(errors[f.key])}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
            <span className="w-8 text-[0.7rem] text-muted-foreground">{f.unit}</span>
          </span>
          <span className={`block text-[0.65rem] ${errors[f.key] ? "text-loss" : "text-muted-foreground"}`}>
            {errors[f.key] ?? f.hint}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- telegram ----------------------------------------------------------------------------------

/** Shows whether alerts have a chat to go to, and runs the one-time-code link flow when they do not. */
export function TelegramPanel({ children }: { children?: ReactNode }) {
  const { data: tg } = useSuspenseQuery(telegramQuery);
  const start = useAgentMutation(() => beginTelegramLink());

  if (tg.linked && !tg.code) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs">
          <CheckIcon className="size-3.5 text-profit" />
          Alerts go to {tg.username ? `@${tg.username}` : "your linked Telegram chat"}.
        </p>
        <Button variant="outline" size="sm" disabled={start.isPending} onClick={() => start.mutate(undefined)}>
          Link another chat
        </Button>
        {children}
      </div>
    );
  }

  const deepLink = tg.code && tg.botUsername ? `https://t.me/${tg.botUsername}?start=${tg.code.value}` : null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Alerts are sent by a Telegram bot. Link your chat once; until then the agent stays paused when it has something
        to send.
      </p>
      {tg.code ? (
        <div className="space-y-1.5 rounded-md border bg-muted/40 p-2.5 text-xs">
          <p>
            Send this to the bot <span className="text-muted-foreground">(valid 10 minutes)</span>:
          </p>
          <code className="block rounded bg-background px-2 py-1.5 font-mono select-all">/start {tg.code.value}</code>
          {deepLink && (
            <a href={deepLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand">
              <SendIcon className="size-3" /> Open in Telegram
            </a>
          )}
        </div>
      ) : (
        <Button size="sm" disabled={start.isPending} onClick={() => start.mutate(undefined)}>
          <SendIcon /> Get a link code
        </Button>
      )}
      <FormError error={start.error} />
    </div>
  );
}
