import { Await, createFileRoute } from "@tanstack/react-router";
import { getFleet, getFleetActivity } from "@/features/bots/bots.functions";
import { ActivityLine, BotCard } from "@/features/bots/components/bot-card";

// Full SSR: the fleet status is the first thing anyone opens, so it ships in
// the document. The 24h tallies read whole journals and stream in after.
export const Route = createFileRoute("/bots/")({
  loader: async () => ({
    fleet: await getFleet(),
    activity: getFleetActivity(),
  }),
  component: FleetPage,
});

function FleetPage() {
  const { fleet, activity } = Route.useLoaderData();

  if (fleet.bots.length === 0) {
    return (
      <div className="panel mx-auto mt-6 max-w-5xl p-6 text-sm text-zinc-400">
        No bots registered. Add one to <code className="num text-zinc-200">bots.json</code>.
      </div>
    );
  }

  return (
    <section className="mx-auto grid max-w-5xl gap-4 px-4 py-6 md:grid-cols-2">
      {fleet.bots.map((bot) => (
        <BotCard
          key={bot.id}
          bot={bot}
          now={fleet.now}
          activity={
            <Await promise={activity} fallback={<span className="h-3 w-32 animate-pulse rounded bg-zinc-800" />}>
              {(tallies) => <ActivityLine activity={tallies.find((t) => t.id === bot.id)} />}
            </Await>
          }
        />
      ))}
    </section>
  );
}
