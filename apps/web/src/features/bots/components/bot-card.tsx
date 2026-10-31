import { Link } from "@tanstack/react-router";
import type { BotActivity, BotSummary } from "@vexis/bot-state";
import type { ReactNode } from "react";
import { kindTone } from "@/features/bots/event-tone";
import { ago } from "@/lib/format";
import { HealthBadge } from "./health-badge";
import { PositionStats } from "./position-stats";

export function BotCard({ bot, now, activity }: { bot: BotSummary; now: number; activity?: ReactNode }) {
  return (
    <Link
      to="/bots/$botId"
      params={{ botId: bot.id }}
      className="panel block p-4 transition hover:border-zinc-600 hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3.25">
        <div>
          <h2 className="font-semibold">{bot.name}</h2>
          <p className="mt-0.5 text-[0.625rem] text-zinc-500">{bot.kind}</p>
        </div>
        <HealthBadge health={bot.health} />
      </div>
      <div className="mt-4">
        <PositionStats bot={bot} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3.25 border-t border-zinc-800 pt-3.25 text-xs">
        {bot.lastEvent ? (
          <span className="truncate">
            <span className={kindTone[bot.lastEvent.kind]}>{bot.lastEvent.title}</span>
            <span className="num ml-1.5 text-[0.625rem] text-zinc-500">{ago(now - bot.lastEvent.at)}</span>
          </span>
        ) : (
          <span className="text-zinc-500">No journal entries</span>
        )}
        {activity}
      </div>
    </Link>
  );
}

export function ActivityLine({ activity }: { activity: BotActivity | undefined }) {
  if (!activity) return null;
  return (
    <span className="num shrink-0 text-[0.625rem] text-zinc-400">
      24h · {activity.rebalances} rebal · {activity.feeClaims} fees ·{" "}
      <span className={activity.errors ? "text-rose-300" : ""}>{activity.errors} err</span>
    </span>
  );
}
