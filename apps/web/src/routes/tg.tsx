import { createFileRoute } from "@tanstack/react-router";
import { getFleet } from "@/features/bots/bots.functions";
import { BotCard } from "@/features/bots/components/bot-card";
import { loadTelegram } from "@/features/telegram/telegram";

// Client-only: the Telegram SDK, initData, and the user's theme exist only
// inside the Mini App webview, so there is nothing true to render on the server.
// The loader runs in the browser and reaches bot state through the same
// server function the SSR routes use.
export const Route = createFileRoute("/tg")({
  ssr: false,
  loader: async () => {
    const [app, fleet] = await Promise.all([loadTelegram(), getFleet()]);
    app.ready();
    app.expand();
    return { fleet, user: app.initDataUnsafe.user?.first_name ?? null };
  },
  pendingComponent: () => <p className="text-xs text-zinc-500">Connecting to Telegram…</p>,
  component: TelegramHome,
});

function TelegramHome() {
  const { fleet, user } = Route.useLoaderData();
  return (
    <section className="mx-auto max-w-5xl space-y-3.25 px-3.25 py-4.75">
      <p className="text-xs text-zinc-400">{user ? `Hi ${user}.` : "Open this page from the bot in Telegram."}</p>
      {fleet.bots.map((bot) => (
        <BotCard key={bot.id} bot={bot} now={fleet.now} />
      ))}
    </section>
  );
}
