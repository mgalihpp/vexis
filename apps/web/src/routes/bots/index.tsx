import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";
import { fleetActivityQuery, fleetQuery } from "@/features/bots/bots.queries";
import { ActivityLine, BotCard } from "@/features/bots/components/bot-card";

// Full SSR: the fleet status is the first thing anyone opens, so it ships in
// the document. The 24h tallies read whole journals and stream in after.
export const Route = createFileRoute("/bots/")({
  loader: async ({ context }) => {
    void context.queryClient.prefetchQuery(fleetActivityQuery);
    await context.queryClient.ensureQueryData(fleetQuery);
  },
  component: FleetPage,
});

function FleetPage() {
  const { data: fleet } = useSuspenseQuery(fleetQuery);

  if (fleet.bots.length === 0) {
    return (
      <div className="panel mx-auto mt-4.75 max-w-5xl p-4.75 text-xs text-zinc-400">
        No bots registered. Add one to <code className="num text-zinc-200">bots.json</code>.
      </div>
    );
  }

  return (
    <section className="mx-auto grid max-w-5xl gap-3.25 px-3.25 py-4.75 md:grid-cols-2">
      {fleet.bots.map((bot) => (
        <BotCard
          key={bot.id}
          bot={bot}
          now={fleet.now}
          activity={
            <Suspense fallback={<span className="h-2.5 w-25.5 animate-pulse rounded bg-zinc-800" />}>
              <BotActivity id={bot.id} />
            </Suspense>
          }
        />
      ))}
    </section>
  );
}

function BotActivity({ id }: { id: string }) {
  const { data: tallies } = useSuspenseQuery(fleetActivityQuery);
  return <ActivityLine activity={tallies.find((t) => t.id === id)} />;
}
