import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { getBotEvents } from "@/features/bots/bots.functions";
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
  loader: ({ params, deps }) =>
    getBotEvents({ data: { botId: params.botId, limit: PAGE_SIZE, offset: (deps.page - 1) * PAGE_SIZE } }),
  pendingComponent: () => <div className="panel h-64 animate-pulse" />,
  component: JournalPage,
});

const stamp = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "medium" });

function JournalPage() {
  const { events, total } = Route.useLoaderData();
  const { page } = Route.useSearch();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-4">
      <table className="panel w-full border-separate border-spacing-0 overflow-hidden text-left">
        <thead className="text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="p-3 font-medium">Time</th>
            <th className="p-3 font-medium">Kind</th>
            <th className="p-3 font-medium">Event</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.seq} className="align-top">
              <td className="num whitespace-nowrap border-t border-zinc-800 p-3 text-xs text-zinc-400">
                {stamp.format(event.at)}
              </td>
              <td className="num border-t border-zinc-800 p-3 text-xs text-zinc-500">{event.kind}</td>
              <td className="border-t border-zinc-800 p-3">
                <EventDetail event={event} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center justify-between text-sm text-zinc-400">
        <span className="num">
          page {page} / {pages} · {total} entries
        </span>
        <div className="flex gap-3">
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
