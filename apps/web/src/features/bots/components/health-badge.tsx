import type { BotHealth } from "@vexis/bot-state";
import { ago } from "@/lib/format";

const healthStyle: Record<BotHealth["state"], { label: string; dot: string; text: string }> = {
  live: { label: "Live", dot: "bg-emerald-400", text: "text-emerald-300" },
  stale: { label: "Stale", dot: "bg-amber-400", text: "text-amber-300" },
  halted: { label: "Halted", dot: "bg-rose-500", text: "text-rose-300" },
  unknown: { label: "No heartbeat", dot: "bg-zinc-500", text: "text-zinc-400" },
};

export function HealthBadge({ health }: { health: BotHealth }) {
  const style = healthStyle[health.state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${style.text}`}>
      <span className={`size-1.5 rounded-full ${style.dot} ${health.state === "live" ? "animate-pulse" : ""}`} />
      {style.label}
      {"ageMs" in health && <span className="num text-[0.625rem] text-zinc-500">{ago(health.ageMs)}</span>}
    </span>
  );
}
