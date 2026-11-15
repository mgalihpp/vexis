import { useQuery } from "@tanstack/react-query";
import { OFFICE_AGENTS, type OfficeAgent } from "@vexis/db/office";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { shortAddr } from "@/lib/format";
import { AGENT_INFO, knownPools, type OfficeView } from "../office";
import { type FeedFilter, officeFeedQuery } from "../office.queries";
import { Section, utcClock } from "./office-ui";

const TONE: Record<string, string> = {
  good: "text-profit",
  bad: "text-loss",
  warn: "text-amber-500",
  info: "text-brand",
};

/** The activity feed, newest first, filtered by agent and pool through the URL. */
export function OfficeLog({
  view,
  filter,
  onFilter,
}: {
  view: OfficeView;
  filter: FeedFilter;
  onFilter: (next: FeedFilter) => void;
}) {
  const filtered = Boolean(filter.agent || filter.pool);
  const feed = useQuery({ ...officeFeedQuery(filter), enabled: filtered });
  const rows = filtered ? (feed.data ?? []) : view.messages;
  const pools = knownPools(view);

  return (
    <Section title="Office log" action={<span className="font-mono text-[0.6875rem] text-muted-foreground">UTC</span>}>
      <div className="grid grid-cols-2 gap-1.5">
        <NativeSelect
          size="sm"
          className="w-full"
          aria-label="Filter by agent"
          value={filter.agent ?? ""}
          onChange={(e) => onFilter({ ...filter, agent: (e.target.value || undefined) as OfficeAgent | undefined })}
        >
          <NativeSelectOption value="">All agents</NativeSelectOption>
          {OFFICE_AGENTS.map((a) => (
            <NativeSelectOption key={a} value={a}>
              {AGENT_INFO[a].name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          size="sm"
          className="w-full"
          aria-label="Filter by pool"
          value={filter.pool ?? ""}
          onChange={(e) => onFilter({ ...filter, pool: e.target.value || undefined })}
        >
          <NativeSelectOption value="">All pools</NativeSelectOption>
          {filter.pool && !pools.some((p) => p.address === filter.pool) && (
            <NativeSelectOption value={filter.pool}>{shortAddr(filter.pool)}</NativeSelectOption>
          )}
          {pools.map((p) => (
            <NativeSelectOption key={p.address} value={p.address}>
              {p.name ?? shortAddr(p.address)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <ol className="m-0 flex max-h-[300px] list-none flex-col overflow-auto p-0 [scrollbar-width:thin]">
        {filtered && feed.isPending && <li className="py-1 text-xs text-muted-foreground">Loading…</li>}
        {!(filtered && feed.isPending) && rows.length === 0 && (
          <li className="py-1 text-xs text-muted-foreground">
            {filtered ? "Nothing matches these filters." : "No activity yet."}
          </li>
        )}
        {rows.map((m) => (
          <li
            key={m.id}
            className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-1.5 border-t py-1.5 text-xs first:border-t-0 sm:grid-cols-[3.25rem_5.25rem_minmax(0,1fr)]"
          >
            <time className="pt-px font-mono text-[0.65rem] text-muted-foreground tabular-nums">{utcClock(m.at)}</time>
            <b className="font-medium">{AGENT_INFO[m.agent].name}</b>
            <span className={`col-start-2 sm:col-start-auto ${TONE[m.tone ?? ""] ?? ""}`}>{m.text}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}
