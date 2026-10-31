import { useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarIcon, ChevronDownIcon, FilterIcon } from "lucide-react";
import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DAY_MS, type DateRange, RANGE_PRESETS, type RangePreset, resolveRange } from "../portfolio";

// Search params carry custom dates as YYYY-MM-DD with an inclusive end day.
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const parseIso = (s: string | undefined) => (s ? Date.parse(`${s}T00:00:00Z`) : null);

export function rangeFromSearch(search: { range: RangePreset; from?: string; to?: string }, now: number): DateRange {
  const from = parseIso(search.from);
  const to = parseIso(search.to);
  return resolveRange(search.range, now, { from, to: to === null ? null : to + DAY_MS });
}

const pretty = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", timeZone: "UTC" });

const presetLabel = (id: RangePreset) => RANGE_PRESETS.find((p) => p.id === id)?.label ?? id;

function summary(range: DateRange) {
  if (range.from === null && range.to === null) return "All time";
  const from = range.from === null ? "…" : pretty(range.from);
  const to = range.to === null ? "…" : pretty(range.to - DAY_MS);
  return from === to ? from : `${from} – ${to}`;
}

// react-day-picker works in local time; these convert between a UTC day and a local Date on that calendar day.
const toLocal = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const fromLocal = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (ms: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex flex-col gap-1.5 text-xs text-foreground/80">
      {label}
      <input
        value={draft ?? (value === null ? "" : pretty(value))}
        placeholder="MMM DD, YYYY"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const parsed = draft ? Date.parse(`${draft} UTC`) : Number.NaN;
          if (!Number.isNaN(parsed)) onChange(parsed);
          setDraft(null);
        }}
        className="h-[1.7rem] w-[5.6rem] rounded-md border border-brand/60 bg-transparent px-1.5 text-[0.65rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-brand"
      />
    </label>
  );
}

export function RangePicker({ now }: { now: number }) {
  const search = useSearch({ from: "/portfolio/$wallet" });
  const navigate = useNavigate({ from: "/portfolio/$wallet" });
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<RangePreset>(search.range);
  const [custom, setCustom] = useState<DateRange>(() => rangeFromSearch({ ...search, range: "custom" }, now));

  const draft = resolveRange(preset, now, custom);
  const applied = rangeFromSearch(search, now);

  const reset = (next: boolean) => {
    if (next) {
      setPreset(search.range);
      setCustom(applied);
    }
    setOpen(next);
  };

  const choose = (id: RangePreset) => {
    setPreset(id);
    if (id !== "custom" && id !== "all") setCustom(resolveRange(id, now));
  };

  const apply = () => {
    const isCustom = preset === "custom";
    navigate({
      search: (prev) => ({
        ...prev,
        range: preset,
        from: isCustom && custom.from !== null ? isoDay(custom.from) : undefined,
        to: isCustom && custom.to !== null ? isoDay(custom.to - DAY_MS) : undefined,
      }),
      resetScroll: false,
    });
    setOpen(false);
  };

  const setEdge = (edge: "from" | "to", ms: number) => {
    setPreset("custom");
    setCustom((c) => ({ ...c, [edge]: edge === "to" ? ms + DAY_MS : ms }));
  };

  return (
    <Popover open={open} onOpenChange={reset}>
      <PopoverTrigger className="inline-flex h-6.5 items-center gap-1.5 rounded-md border px-2 text-xs">
        <CalendarIcon className="size-3.25" />
        <span className="font-semibold">
          {search.range === "custom" ? "Custom" : presetLabel(search.range).split(" (")[0]}
        </span>
        <span className="text-foreground/80">{summary(applied)}</span>
        <ChevronDownIcon className="size-3.25" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(36.5rem,calc(100vw-0.8rem))] gap-0 overflow-hidden p-0">
        <div className="flex h-[19rem]">
          <ul className="w-[11.1rem] shrink-0 overflow-y-auto border-r p-0.75">
            {RANGE_PRESETS.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  className={`w-full rounded-md px-2 py-1.25 text-left text-xs whitespace-nowrap ${
                    preset === p.id ? "bg-brand text-brand-foreground" : "hover:bg-muted"
                  }`}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-end gap-2.5 border-b p-3.25">
              <DateField label="Start date" value={draft.from} onChange={(ms) => setEdge("from", ms)} />
              <span className="pb-1.5 text-muted-foreground">-</span>
              <DateField
                label="End date"
                value={draft.to === null ? null : draft.to - DAY_MS}
                onChange={(ms) => setEdge("to", ms)}
              />
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto p-1.5">
              {preset === "all" ? (
                <span className="text-xs text-muted-foreground">All dates selected</span>
              ) : (
                <Calendar
                  mode="range"
                  numberOfMonths={2}
                  defaultMonth={toLocal((draft.to ?? now + DAY_MS) - DAY_MS - 31 * DAY_MS)}
                  selected={{
                    from: draft.from === null ? undefined : toLocal(draft.from),
                    to: draft.to === null ? undefined : toLocal(draft.to - DAY_MS),
                  }}
                  onSelect={(r) => {
                    setPreset("custom");
                    setCustom({
                      from: r?.from ? fromLocal(r.from) : null,
                      to: r?.to ? fromLocal(r.to) + DAY_MS : r?.from ? fromLocal(r.from) + DAY_MS : null,
                    });
                  }}
                />
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2.5 border-t px-3.25 py-2.5">
          <button
            type="button"
            onClick={() => reset(false)}
            className="px-2.5 text-xs font-semibold hover:text-foreground/80"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={apply}
            className="h-6.5 rounded-md bg-brand px-2.5 text-xs font-semibold text-brand-foreground hover:bg-brand/90"
          >
            Apply
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PairFilter({ pairs }: { pairs: string[] }) {
  const search = useSearch({ from: "/portfolio/$wallet" });
  const navigate = useNavigate({ from: "/portfolio/$wallet" });
  const selected = new Set(search.pairs ?? []);
  const set = (next: Set<string>) =>
    navigate({ search: (prev) => ({ ...prev, pairs: next.size ? [...next].sort() : undefined }), resetScroll: false });
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Filter by pair"
        className={`relative p-1.25 hover:text-foreground ${selected.size ? "text-brand" : "text-foreground/80"}`}
      >
        <FilterIcon className="size-3.25" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-51.25 p-1.5">
        <div className="flex items-center justify-between px-0.75 pb-1.5 text-xs font-semibold">
          Pairs
          {selected.size > 0 && (
            <button type="button" className="text-[0.625rem] font-normal text-brand" onClick={() => set(new Set())}>
              Clear
            </button>
          )}
        </div>
        <ul className="max-h-57.5 overflow-y-auto">
          {pairs.map((pair) => (
            <li key={pair}>
              <label
                htmlFor={`pair-${pair}`}
                className="flex cursor-pointer items-center gap-1.5 rounded px-0.75 py-1.25 text-xs hover:bg-muted"
              >
                <Checkbox
                  id={`pair-${pair}`}
                  checked={selected.has(pair)}
                  onCheckedChange={(on) => {
                    const next = new Set(selected);
                    if (on) next.add(pair);
                    else next.delete(pair);
                    set(next);
                  }}
                />
                {pair}
              </label>
            </li>
          ))}
          {pairs.length === 0 && <li className="px-0.75 py-1.5 text-xs text-muted-foreground">No pairs yet.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
