import { useQuery } from "@tanstack/react-query";
import { OFFICE_AGENTS, type OfficeAgent } from "@vexis/db/office";
import { ScrollTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { shortAddr } from "@/lib/format";
import { AGENT_INFO, knownPools, type OfficeView } from "../office";
import { type FeedFilter, officeFeedQuery } from "../office.queries";
import { PanelEmpty, Section, utcClock } from "./office-ui";

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
    <Section
      title="Activity"
      action={
        filtered && (
          <Button variant="ghost" size="xs" onClick={() => onFilter({})}>
            Clear
          </Button>
        )
      }
    >
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
      {filtered && feed.isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <PanelEmpty icon={<ScrollTextIcon />} title={filtered ? "No matches" : "No activity yet"} />
      ) : (
        <ol className="m-0 flex list-none flex-col p-0">
          {rows.map((m) => (
            <li
              key={m.id}
              className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2 border-t py-1.5 text-xs first:border-t-0 first:pt-0"
            >
              <time className="pt-px font-mono text-[0.65rem] text-muted-foreground tabular-nums">
                {utcClock(m.at).slice(0, 5)}
              </time>
              <span className="min-w-0 [overflow-wrap:anywhere]">
                <b className="mr-1.5 font-medium">{AGENT_INFO[m.agent].name}</b>
                <span className={TONE[m.tone ?? ""] ?? "text-muted-foreground"}>{m.text}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
