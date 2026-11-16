import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  FlameIcon,
  GemIcon,
  ListIcon,
  type LucideIcon,
  SlidersHorizontalIcon,
  TrendingUpIcon,
} from "lucide-react";
import { screenerQuery } from "@/features/screener/screener.queries";
import {
  DEFAULT_CONFIG,
  type Draft,
  describeFilter,
  formatMinutes,
  MAX_POOLS,
  PRESET_IDS,
  type PresetChoice,
  presetLabel,
  SCREENER_PRESETS,
  screenerMatches,
  type VolumeAgentView,
} from "../agents";
import { PoolsTable } from "./pools-table";

type Source = Draft["source"];

const SOURCE_ICON: Record<"pools" | PresetChoice, LucideIcon> = {
  pools: ListIcon,
  "blue-chip": GemIcon,
  "mid-cap": TrendingUpIcon,
  degen: FlameIcon,
  custom: SlidersHorizontalIcon,
};

/**
 * Where a volume-watch agent finds its pools: picked by hand, or every screener pool that passes a preset. Match counts
 * read the screener list the screener page already polls, so they cost no extra datapi request.
 */
export function SourcePicker({ value, onChange }: { value: Source; onChange: (next: Source) => void }) {
  const { data } = useQuery(screenerQuery);
  const count = (preset: PresetChoice) => {
    const matches = data && screenerMatches({ ...DEFAULT_CONFIG, ...value, source: "screener", preset }, data.pools);
    return matches ? `${matches.length} pools now` : "Counting…";
  };
  const options: { id: "pools" | PresetChoice; name: string; sub: string; meta?: string; disabled?: boolean }[] = [
    { id: "pools", name: "Pools you pick", sub: `Up to ${MAX_POOLS} pools, chosen by hand` },
    ...PRESET_IDS.map((id) => ({
      id,
      name: SCREENER_PRESETS[id].label,
      sub: SCREENER_PRESETS[id].sub,
      meta: count(id),
    })),
    {
      id: "custom",
      name: "Custom",
      sub: value.custom
        ? describeFilter(value.custom)
        : "Filter the screener, then press “Alert on pools like these” to watch its pools.",
      meta: value.custom ? count("custom") : undefined,
      disabled: !value.custom,
    },
  ];
  const selected = value.source === "pools" ? "pools" : value.preset;
  const pick = (id: "pools" | PresetChoice) =>
    onChange(id === "pools" ? { ...value, source: "pools" } : { ...value, source: "screener", preset: id });

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {options.map((o) => {
          const Icon = SOURCE_ICON[o.id];
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={o.disabled}
                aria-pressed={selected === o.id}
                onClick={() => pick(o.id)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left ${
                  o.disabled ? "opacity-60" : selected === o.id ? "border-brand/50 bg-brand/5" : "hover:bg-muted/40"
                }`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand/25 bg-brand/10 text-brand">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{o.name}</span>
                  <span className="block text-xs text-muted-foreground">{o.sub}</span>
                </span>
                {o.meta && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{o.meta}</span>}
                {selected === o.id ? (
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                    <CheckIcon className="size-3" />
                  </span>
                ) : (
                  <span className="size-5 shrink-0 rounded-full border" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!value.custom && (
        <p className="text-xs text-muted-foreground">
          <Link to="/screener" className="font-medium text-brand hover:underline">
            Open the screener
          </Link>{" "}
          to build a custom filter.
        </p>
      )}
    </div>
  );
}

/** The screener pools a screener-source agent watches right now. */
export function ScreenerMatches({ agent, now }: { agent: VolumeAgentView; now: number }) {
  const { data } = useQuery(screenerQuery);
  const matches = data ? (screenerMatches(agent.config, data.pools) ?? []) : null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        This agent watches every screener pool the {presetLabel(agent.config.preset)} filter passes, judged on a{" "}
        {formatMinutes(agent.config.baseline * 60)} baseline. Pools join and leave as they move in and out of the
        filter.
        {agent.pools.length > 0 &&
          ` Your ${agent.pools.length} hand-picked pools are kept for when you switch back in Settings.`}
      </p>
      <PoolsTable
        agentId={agent.id}
        now={now}
        empty={matches === null ? "Loading the screener…" : "No screener pool passes this filter right now."}
        rows={(matches ?? []).map((p) => ({
          address: p.address,
          label: p.name,
          tokens: [
            { symbol: p.tokenX.symbol, icon: p.tokenX.icon },
            { symbol: p.tokenY.symbol, icon: p.tokenY.icon },
          ],
          lastAlertAt: null,
        }))}
      />
    </div>
  );
}
