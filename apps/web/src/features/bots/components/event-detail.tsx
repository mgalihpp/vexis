import type { BotEvent } from "@vexis/bot-state";
import { kindTone } from "@/features/bots/event-tone";
import { shortAddr, solscanTx } from "@/lib/format";

export function EventDetail({ event }: { event: BotEvent }) {
  return (
    <>
      <span className={`font-medium ${kindTone[event.kind]}`}>{event.title}</span>
      {event.repeats && event.repeats > 1 && <span className="num ml-2 text-xs text-zinc-500">×{event.repeats}</span>}
      {event.detail && <p className="mt-0.5 break-words text-sm text-zinc-400">{event.detail}</p>}
      {event.signature && (
        <a
          href={solscanTx(event.signature)}
          target="_blank"
          rel="noreferrer"
          className="num mt-1 inline-block text-xs text-emerald-300/80 hover:underline"
        >
          {shortAddr(event.signature)} ↗
        </a>
      )}
    </>
  );
}
