import type { EventKind } from "@vexis/bot-state";

export const kindTone: Record<EventKind, string> = {
  started: "text-sky-300",
  stopped: "text-zinc-400",
  decision: "text-zinc-400",
  "out-of-range": "text-amber-300",
  opened: "text-emerald-300",
  closed: "text-zinc-300",
  rebalanced: "text-emerald-300",
  fees: "text-violet-300",
  paused: "text-amber-300",
  resumed: "text-sky-300",
  config: "text-zinc-300",
  halted: "text-rose-300",
  error: "text-rose-300",
};
