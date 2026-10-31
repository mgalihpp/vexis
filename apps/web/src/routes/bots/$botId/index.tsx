import { createFileRoute, Link } from "@tanstack/react-router";
import { EVENT_KINDS, EventKind } from "@vexis/bot-state";
import { z } from "zod";
import { getBotEvents } from "@/features/bots/bots.functions";
import { EventDetail } from "@/features/bots/components/event-detail";
import { kindTone } from "@/features/bots/event-tone";
import { ago } from "@/lib/format";

// A hand-edited URL degrades to the defaults instead of an error page.
const FeedSearch = z.object({
  kinds: z.array(EventKind).optional().catch(undefined),
  limit: z.number().int().min(10).max(500).default(50).catch(50),
});

export const Route = createFileRoute("/bots/$botId/")({
  validateSearch: FeedSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) => getBotEvents({ data: { botId: params.botId, ...deps } }),
  component: FeedPage,
});

function FeedPage() {
  const { events, total, now } = Route.useLoaderData();
  const { kinds, limit } = Route.useSearch();
  const selected = new Set(kinds ?? []);

  const toggle = (kind: EventKind) => {
    const next = new Set(selected);
    if (next.has(kind)) next.delete(kind);
    else next.add(kind);
    return next.size ? EVENT_KINDS.filter((k) => next.has(k)) : undefined;
  };

  return (
    <section className="space-y-3.25">
      <div className="flex flex-wrap gap-1.25">
        {EVENT_KINDS.map((kind) => (
          <Link
            key={kind}
            from={Route.fullPath}
            search={(prev) => ({ ...prev, kinds: toggle(kind) })}
            className={`rounded-full border px-2 py-0.5 text-[0.625rem] ${
              selected.has(kind) ? `border-zinc-500 bg-zinc-800 ${kindTone[kind]}` : "border-zinc-800 text-zinc-500"
            }`}
          >
            {kind}
          </Link>
        ))}
      </div>

      <ol className="panel divide-y divide-zinc-800">
        {events.length === 0 && <li className="p-4 text-xs text-zinc-500">No events match.</li>}
        {events.map((event) => (
          <li key={event.seq} className="flex gap-3.25 p-3.25">
            <span className="num w-12.75 shrink-0 pt-0.5 text-[0.625rem] text-zinc-500">{ago(now - event.at)}</span>
            <div className="min-w-0">
              <EventDetail event={event} />
            </div>
          </li>
        ))}
      </ol>

      {total > events.length && (
        <Link
          from={Route.fullPath}
          search={(prev) => ({ ...prev, limit: Math.min(500, limit * 2) })}
          className="block text-center text-xs text-emerald-300 hover:underline"
        >
          Show more ({total - events.length} older)
        </Link>
      )}
    </section>
  );
}
