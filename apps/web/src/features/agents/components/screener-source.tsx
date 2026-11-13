import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckIcon, FilterIcon, ListIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { compactUsd } from "@/features/portfolio/money";
import { pricesQuery } from "@/features/portfolio/portfolio.queries";
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
  spikeRule,
  type VolumeAgentView,
  type VolumeWatchConfig,
} from "../agents";
import { PoolCell } from "./agent-layout";

type Source = Draft["source"];

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
        {options.map((o) => (
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
                {o.id === "pools" ? <ListIcon className="size-4" /> : <FilterIcon className="size-4" />}
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
        ))}
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

/** A preset's spike rule, which the user reads but does not set. */
export function PresetRule({ config }: { config: Pick<VolumeWatchConfig, "source" | "preset" | "custom"> }) {
  const r = spikeRule({ ...DEFAULT_CONFIG, ...config });
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-xs">
      <p className="mb-2 text-muted-foreground">
        The {presetLabel(config.preset)} preset sets the spike rule, so tuning it reaches every agent on it.
      </p>
      <dl className="space-y-1.5">
        {[
          ["Spike", `≥ ${r.mult}× the median`],
          ["Baseline", formatMinutes(r.baseline * 60)],
          ["Minimum volume", `${compactUsd(r.minUsd)} / min`],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const solFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });

/** USD with SOL under it at the footer's SOL price; a dash when that price is missing. */
function Amount({ usd, solPrice }: { usd: number; solPrice: number | null }) {
  return (
    <>
      <div>{compactUsd(usd)}</div>
      <div className="text-[0.625rem] text-muted-foreground">
        {solPrice ? `${solFmt.format(usd / solPrice)} SOL` : "—"}
      </div>
    </>
  );
}

/** The screener pools a screener-source agent watches right now. */
export function ScreenerMatches({ agent }: { agent: VolumeAgentView }) {
  const { data } = useQuery(screenerQuery);
  const { data: prices } = useQuery(pricesQuery);
  const matches = data ? (screenerMatches(agent.config, data.pools) ?? []) : null;
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        This agent watches every screener pool the {presetLabel(agent.config.preset)} filter passes, judged on a{" "}
        {formatMinutes(spikeRule(agent.config).baseline * 60)} baseline. Pools join and leave as they move in and out of
        the filter.
        {agent.pools.length > 0 &&
          ` Your ${agent.pools.length} hand-picked pools are kept for when you switch back in Settings.`}
      </p>
      <div className="-mx-2 overflow-x-auto">
        <Table className="min-w-[32rem]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-3.25">Pool</TableHead>
              <TableHead className="text-right">TVL</TableHead>
              <TableHead className="pr-3.25 text-right">Volume 24h</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="tabular-nums">
            {(matches === null || matches.length === 0) && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={3} className="py-10 text-center text-muted-foreground">
                  {matches === null ? "Loading the screener…" : "No screener pool passes this filter right now."}
                </TableCell>
              </TableRow>
            )}
            {matches?.map((p) => (
              <TableRow key={p.address}>
                <TableCell className="pl-3.25">
                  <PoolCell
                    address={p.address}
                    label={p.name}
                    tokens={[
                      { symbol: p.tokenX.symbol, icon: p.tokenX.icon },
                      { symbol: p.tokenY.symbol, icon: p.tokenY.icon },
                    ]}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Amount usd={p.tvl} solPrice={prices?.sol ?? null} />
                </TableCell>
                <TableCell className="pr-3.25 text-right">
                  <Amount usd={p.volume["24h"]} solPrice={prices?.sol ?? null} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
