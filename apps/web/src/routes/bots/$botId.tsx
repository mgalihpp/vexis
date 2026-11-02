import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { botQuery } from "@/features/bots/bots.queries";
import { HealthBadge } from "@/features/bots/components/health-badge";
import { PositionStats } from "@/features/bots/components/position-stats";

export const Route = createFileRoute("/bots/$botId")({
  loader: ({ params, context }) => context.queryClient.ensureQueryData(botQuery(params.botId)),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.bot.name} · Vexis` : "Vexis" }],
  }),
  component: BotLayout,
});

const tab = "rounded-md px-2.5 py-1.25 text-xs text-zinc-400 hover:text-zinc-100";

function BotLayout() {
  const { botId } = Route.useParams();
  const { bot } = useSuspenseQuery(botQuery(botId)).data;

  return (
    <div className="mx-auto max-w-5xl space-y-4.75 px-3.25 py-4.75">
      <section className="panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3.25">
          <div>
            <h1 className="text-base font-semibold">{bot.name}</h1>
            <p className="mt-0.5 text-[0.625rem] text-zinc-500">{bot.kind}</p>
          </div>
          <HealthBadge health={bot.health} />
        </div>
        {bot.health.state === "halted" && (
          <p className="mt-3.25 rounded-md bg-rose-500/10 px-2.5 py-1.5 text-xs text-rose-200">{bot.health.reason}</p>
        )}
        <div className="mt-4">
          <PositionStats bot={bot} />
        </div>
      </section>

      <nav className="flex gap-0.75">
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
