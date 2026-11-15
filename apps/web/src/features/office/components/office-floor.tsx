import { OFFICE_AGENTS, type OfficeAgent } from "@vexis/db/office";
import { CrosshairIcon, Maximize2Icon, MinusIcon, PlusIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { AGENT_INFO, type DeskStatus, type MessageView, walks } from "../office";
import { createFloor, type Floor, type FloorInput } from "./floor/engine";
import { ROOMS, type SceneData, STATUS_COLOR } from "./floor/scene";
import { DROP, ERRAND_SPOT } from "./floor/world";
import { utcClock } from "./office-ui";

const TONE_EDGE: Record<string, string> = {
  good: "shadow-[inset_0_-3px_0_#4ad69b,0_2px_0_rgba(0,0,0,.45)]",
  bad: "shadow-[inset_0_-3px_0_#ff6b6b,0_2px_0_rgba(0,0,0,.45)]",
  warn: "shadow-[inset_0_-3px_0_#f5c451,0_2px_0_rgba(0,0,0,.45)]",
  info: "shadow-[inset_0_-3px_0_#baf448,0_2px_0_rgba(0,0,0,.45)]",
};

/** The pixel office: a canvas the engine draws, and an overlay of bubbles, name tags and room labels. */
export function OfficeFloor({
  data,
  statuses,
  bubbles,
  messages,
  selected,
  onSelect,
  follow,
  onFollow,
  now,
  onNewMessages,
}: {
  data: SceneData;
  statuses: Record<OfficeAgent, DeskStatus>;
  bubbles: Partial<Record<OfficeAgent, MessageView>>;
  messages: MessageView[];
  selected: OfficeAgent;
  onSelect: (agent: OfficeAgent) => void;
  follow: boolean;
  onFollow: (on: boolean) => void;
  now: number;
  onNewMessages: () => void;
}) {
  const view = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const floor = useRef<Floor | null>(null);
  const input = useRef<FloorInput>({ data, selected, follow, talking: new Set() });
  input.current = { data, selected, follow, talking: new Set(Object.keys(bubbles)) };
  const handlers = useRef({ onSelect, onFollow });
  handlers.current = { onSelect, onFollow };

  useEffect(() => {
    if (!view.current || !overlay.current) return;
    const f = createFloor({
      view: view.current,
      overlay: overlay.current,
      read: () => input.current,
      onSelect: (a) => handlers.current.onSelect(a),
      onPan: () => handlers.current.onFollow(false),
    });
    floor.current = f;
    return () => {
      f.destroy();
      floor.current = null;
    };
  }, []);

  // A message that arrives while the page is open starts a walk; the ones already there on load do not.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(messages.map((m) => m.id));
      return;
    }
    const fresh = walks(seen.current, messages);
    for (const m of messages) seen.current.add(m.id);
    if (fresh.length === 0) return;
    onNewMessages();
    for (const w of fresh) {
      const errand = w.to === "screen" || w.to === "terminal" || w.to === "cabinet";
      const spot = errand ? ERRAND_SPOT[w.to as keyof typeof ERRAND_SPOT] : DROP[w.to as OfficeAgent];
      if (spot) floor.current?.walk(w.walker, spot, !errand || w.walker === "bookkeeper");
    }
  }, [messages, onNewMessages]);

  return (
    <section aria-label="Office floor" className="min-w-0 overflow-hidden rounded-lg bg-card">
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-2">
        <span className="rounded border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
          UTC {utcClock(now).slice(0, 5)}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="outline" size="sm" aria-pressed={follow} onClick={() => onFollow(!follow)}>
            <CrosshairIcon />
            {follow ? "Following" : "Follow"}
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Zoom out" onClick={() => floor.current?.zoom(1 / 1.3)}>
            <MinusIcon />
          </Button>
          <Button variant="outline" size="icon-sm" aria-label="Zoom in" onClick={() => floor.current?.zoom(1.3)}>
            <PlusIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Show the whole floor"
            onClick={() => {
              onFollow(false);
              floor.current?.fit();
            }}
          >
            <Maximize2Icon />
          </Button>
        </div>
      </div>
      <div className="relative bg-[#07070a] leading-none select-none">
        <canvas
          ref={view}
          role="img"
          aria-label="Pixel office floor with seven agents: Scout, Strategist, Risk Manager, Manager, Monitor, Executor and Bookkeeper"
          className="block aspect-[5/3] w-full cursor-grab touch-pan-y [image-rendering:pixelated] data-[drag=true]:cursor-grabbing data-[zoomed=true]:touch-none"
        />
        <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden leading-tight [--s:2]">
          {ROOMS.map((room, i) => (
            <div
              key={room.label}
              data-floor-room={i}
              className="absolute -translate-1/2 font-mono text-[clamp(8px,calc(var(--s)*4.4px),14px)] tracking-[0.16em] whitespace-nowrap text-white/35 [text-shadow:0_1px_0_rgba(0,0,0,.6)]"
            >
              {room.label}
            </div>
          ))}
          {OFFICE_AGENTS.map((agent) => {
            const said = bubbles[agent];
            const pressed = agent === selected;
            return (
              <div
                key={agent}
                data-floor-agent={agent}
                className="absolute flex w-max max-w-[46%] -translate-x-1/2 -translate-y-full flex-col items-center gap-[3px]"
              >
                {said && (
                  <div
                    key={said.id}
                    className={`relative max-w-[clamp(130px,calc(var(--s)*92px),280px)] rounded-[3px] border-2 border-[#16131d] bg-[#f6f6ef] px-[7px] pt-[3px] pb-1 text-center font-mono text-[clamp(10px,calc(var(--s)*5px),14px)] leading-[1.15] text-[#16131d] after:absolute after:-bottom-[7px] after:left-1/2 after:-ml-1 after:border-4 after:border-transparent after:border-t-[#16131d] motion-safe:animate-in motion-safe:zoom-in-75 motion-safe:fade-in ${TONE_EDGE[said.tone ?? ""] ?? "shadow-[0_2px_0_rgba(0,0,0,.45)]"}`}
                  >
                    {said.text}
                  </div>
                )}
                <button
                  type="button"
                  aria-pressed={pressed}
                  aria-label={`Show ${AGENT_INFO[agent].name}`}
                  onClick={() => onSelect(agent)}
                  className={`pointer-events-auto inline-flex cursor-pointer items-center gap-1 rounded-full border bg-[rgba(9,9,11,.82)] py-px pr-1.5 pl-[5px] text-[clamp(9px,calc(var(--s)*4.2px),12px)] font-medium text-[#fafafa] ${pressed ? "border-[#baf448] text-[#baf448]" : "border-white/15"}`}
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ background: data.stopped ? STATUS_COLOR.error : STATUS_COLOR[statuses[agent]] }}
                  />
                  {AGENT_INFO[agent].name}
                </button>
              </div>
            );
          })}
          {data.stopped && (
            <div className="absolute top-1/2 left-1/2 flex -translate-1/2 flex-col items-center gap-1 rounded-lg border-2 border-[#ff6b6b] bg-[rgba(20,4,6,.92)] px-5 py-3 text-center">
              <b className="font-brand text-[clamp(16px,3vw,28px)] tracking-[0.08em] text-[#ff6b6b]">OFFICE STOPPED</b>
              <span className="text-xs text-[#fca5a5]">Every agent is paused.</span>
            </div>
          )}
        </div>
      </div>
      <p className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        Click an agent for details. Zoom with the buttons or Ctrl + scroll, then drag to pan. Walks are decoration: an
        agent moves when a new message arrives.
      </p>
    </section>
  );
}
