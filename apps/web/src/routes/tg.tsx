import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { fleetQuery } from "@/features/bots/bots.queries";
import { BotCard } from "@/features/bots/components/bot-card";
import { loadTelegram } from "@/features/telegram/telegram";

// Client-only: the Telegram SDK, initData, and the user's theme exist only
// inside the Mini App webview, so there is nothing true to render on the server.
// The loader runs in the browser and reaches bot state through the same
// server function the SSR routes use.
export const Route = createFileRoute("/tg")({
  ssr: false,
  loader: async ({ context }) => {
    const [app] = await Promise.all([loadTelegram(), context.queryClient.ensureQueryData(fleetQuery)]);
    app.ready();
    app.expand();
    return { user: app.initDataUnsafe.user?.first_name ?? null };
  },
  pendingComponent: () => <p className="text-xs text-zinc-500">Connecting to Telegram…</p>,
  component: TelegramHome,
});

function TelegramHome() {
  const { user } = Route.useLoaderData();
  const { data: fleet } = useSuspenseQuery(fleetQuery);
  return (
    <section className="mx-auto max-w-5xl space-y-3.25 px-3.25 py-4.75">
      <p className="text-xs text-zinc-400">{user ? `Hi ${user}.` : "Open this page from the bot in Telegram."}</p>
      {fleet.bots.map((bot) => (
        <BotCard key={bot.id} bot={bot} now={fleet.now} />
      ))}
    </section>
  );
}
