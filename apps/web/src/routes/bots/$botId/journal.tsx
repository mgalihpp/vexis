import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { botEventsQuery } from "@/features/bots/bots.queries";
import { EventDetail } from "@/features/bots/components/event-detail";

const PAGE_SIZE = 100;

const JournalSearch = z.object({
  page: z.number().int().min(1).default(1).catch(1),
});

// Data-only SSR: the loader still runs on the server, but absolute timestamps
// must render in the viewer's time zone, which the server cannot know.
export const Route = createFileRoute("/bots/$botId/journal")({
  ssr: "data-only",
  validateSearch: JournalSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps, context }) => {
    await context.queryClient.ensureQueryData(journalQuery(params.botId, deps.page));
  },
  pendingComponent: () => <div className="panel h-51.25 animate-pulse" />,
  component: JournalPage,
});

const journalQuery = (botId: string, page: number) =>
  botEventsQuery({ botId, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });

const stamp = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

function JournalPage() {
  const { botId } = Route.useParams();
  const { page } = Route.useSearch();
  const { events, total } = useSuspenseQuery(journalQuery(botId, page)).data;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-3.25">
      <table className="panel w-full border-separate border-spacing-0 overflow-hidden text-left">
        <thead className="text-[0.625rem] uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="p-2.5 font-medium">Time</th>
            <th className="p-2.5 font-medium">Kind</th>
            <th className="p-2.5 font-medium">Event</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.seq} className="align-top">
              <td className="num whitespace-nowrap border-t border-zinc-800 p-2.5 text-[0.625rem] text-zinc-400">
                {stamp.format(event.at)}
              </td>
              <td className="num border-t border-zinc-800 p-2.5 text-[0.625rem] text-zinc-500">{event.kind}</td>
              <td className="border-t border-zinc-800 p-2.5">
                <EventDetail event={event} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span className="num">
          page {page} / {pages} · {total} entries
        </span>
        <div className="flex gap-2.5">
          {page > 1 && (
            <Link from={Route.fullPath} search={{ page: page - 1 }} className="hover:text-zinc-100">
              ← newer
            </Link>
          )}
          {page < pages && (
            <Link from={Route.fullPath} search={{ page: page + 1 }} className="hover:text-zinc-100">
              older →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
