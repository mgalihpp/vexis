import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { getBot } from "@/features/bots/bots.functions";
import { HealthBadge } from "@/features/bots/components/health-badge";
import { PositionStats } from "@/features/bots/components/position-stats";

export const Route = createFileRoute("/bots/$botId")({
  loader: ({ params }) => getBot({ data: { botId: params.botId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.bot.name} · Vexis` : "Vexis" }],
  }),
  component: BotLayout,
});

const tab = "rounded-md px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100";

function BotLayout() {
  const { bot } = Route.useLoaderData();
  const { botId } = Route.useParams();

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <section className="panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{bot.name}</h1>
            <p className="mt-0.5 text-xs text-zinc-500">{bot.kind}</p>
          </div>
          <HealthBadge health={bot.health} />
        </div>
        {bot.health.state === "halted" && (
          <p className="mt-4 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{bot.health.reason}</p>
        )}
        <div className="mt-5">
          <PositionStats bot={bot} />
        </div>
      </section>

      <nav className="flex gap-1">
        <Link
          to="/bots/$botId"
          params={{ botId }}
          activeOptions={{ exact: true, includeSearch: false }}
          className={tab}
          activeProps={{ className: "bg-zinc-800 text-zinc-100" }}
        >
          Feed
        </Link>
        <Link
          to="/bots/$botId/journal"
          params={{ botId }}
          className={tab}
          activeProps={{ className: "bg-zinc-800 text-zinc-100" }}
        >
          Journal
        </Link>
      </nav>

      <Outlet />
    </div>
  );
}
