import { OFFICE_AGENTS, type OfficeAgent } from "@vexis/shared/office";
import { CrosshairIcon, Maximize2Icon, MinusIcon, PanelLeftCloseIcon, PanelLeftOpenIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Kbd } from "@/components/ui/kbd";
import { useIsMobile } from "@/hooks/use-mobile";
import { AGENT_INFO, DESK_LABEL, type DeskStatus, type MessageView, walks } from "../office";
import { Portrait } from "./agent-card";
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

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * The pixel office: a canvas the engine draws, an overlay of bubbles, name tags and room labels, the picked agent's
 * card in a dialog, and the roster under the floor (keys 1 to 7 pick an agent).
 */
export function OfficeFloor({
  data,
  statuses,
  bubbles,
  messages,
  selected,
  focus,
  onSelect,
  follow,
  onFollow,
  now,
  onNewMessages,
  card,
  live,
}: {
  data: SceneData;
  statuses: Record<OfficeAgent, DeskStatus>;
  bubbles: Partial<Record<OfficeAgent, MessageView>>;
  messages: MessageView[];
  /** The agent whose card is open. */
  selected: OfficeAgent | null;
  /** The agent picked last; the camera follows it. */
  focus: OfficeAgent;
  onSelect: (agent: OfficeAgent | null) => void;
  follow: boolean;
  onFollow: (on: boolean) => void;
  now: number;
  onNewMessages: () => void;
  card: ReactNode;
  /** The office signs and sends what is approved (else Preview). */
  live: boolean;
}) {
  const isMobile = useIsMobile();
  const view = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const floor = useRef<Floor | null>(null);
  const input = useRef<FloorInput>({ data, selected, focus, follow, talking: new Set() });
  input.current = { data, selected, focus, follow, talking: new Set(Object.keys(bubbles)) };
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      const agent = OFFICE_AGENTS[Number(e.key) - 1];
      if (agent) handlers.current.onSelect(agent);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
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

  const working = OFFICE_AGENTS.filter((a) => statuses[a] === "thinking" || statuses[a] === "waiting").length;

  return (
    <section
      aria-label="Office floor"
      className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-card lg:h-full lg:flex-row"
    >
      <Roster statuses={statuses} stopped={data.stopped} selected={selected} onSelect={onSelect} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2">
          <HudChip>
            <span
              className={`size-1.5 rounded-full ${data.stopped ? "bg-loss" : "bg-profit motion-safe:animate-pulse"}`}
            />
            {data.stopped ? "Stopped" : "Live"}
          </HudChip>
          <HudChip>UTC {utcClock(now).slice(0, 5)}</HudChip>
          <HudChip>
            {data.stopped ? 0 : working}/{OFFICE_AGENTS.length} working
          </HudChip>
          <HudChip className="hidden text-brand sm:inline-flex">{live ? "Live trading" : "Preview"}</HudChip>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="outline" size="sm" aria-pressed={follow} onClick={() => onFollow(!follow)}>
              <CrosshairIcon />
              {follow ? `Following ${AGENT_INFO[focus].name}` : "Follow"}
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
        <div className="relative min-w-0 border-t bg-[#07070a] max-lg:aspect-[5/3] lg:min-h-0 lg:flex-1">
          <div className="absolute inset-0 leading-none select-none">
            <canvas
              ref={view}
              role="img"
              aria-label="Pixel office floor with seven agents: Scout, Strategist, Risk Manager, Manager, Monitor, Executor and Bookkeeper"
              className="block size-full cursor-grab touch-pan-y [image-rendering:pixelated] data-[drag=true]:cursor-grabbing data-[hover=true]:cursor-pointer data-[zoomed=true]:touch-none"
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
                    {said && !pressed && (
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
                      className={`pointer-events-auto inline-flex cursor-pointer items-center gap-1 rounded-full border bg-[rgba(9,9,11,.82)] py-px pr-1.5 pl-[5px] text-[clamp(9px,calc(var(--s)*4.2px),12px)] font-medium text-[#fafafa] transition-colors hover:border-white/50 ${pressed ? "border-[#baf448] text-[#baf448]" : "border-white/15"}`}
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
                  <b className="font-brand text-[clamp(16px,3vw,28px)] tracking-[0.08em] text-[#ff6b6b]">
                    OFFICE STOPPED
                  </b>
                  <span className="text-xs text-[#fca5a5]">Every agent is paused.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {isMobile ? (
        <Drawer open={selected !== null} onOpenChange={(open) => !open && onSelect(null)}>
          <DrawerContent aria-describedby={undefined} className="data-[vaul-drawer-direction=bottom]:max-h-[85dvh]">
            {card}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={selected !== null} onOpenChange={(open) => !open && onSelect(null)}>
          <DialogContent
            aria-describedby={undefined}
            showCloseButton={false}
            className="flex max-h-[min(40rem,90dvh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          >
            {card}
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

const ROSTER_KEY = "vexis-office-roster";

/** The agents in a sidebar left of the floor; folds to portraits only, remembered per browser. */
function Roster({
  statuses,
  stopped,
  selected,
  onSelect,
}: {
  statuses: Record<OfficeAgent, DeskStatus>;
  stopped: boolean;
  selected: OfficeAgent | null;
  onSelect: (agent: OfficeAgent | null) => void;
}) {
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    try {
      setFolded(localStorage.getItem(ROSTER_KEY) === "folded");
    } catch {}
  }, []);
  const toggle = () => {
    setFolded(!folded);
    try {
      localStorage.setItem(ROSTER_KEY, folded ? "open" : "folded");
    } catch {}
  };
  return (
    <nav
      aria-label="Agents"
      className={`flex shrink-0 gap-0.5 overflow-x-auto border-b p-1.5 transition-[width] lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0 ${folded ? "lg:w-12" : "lg:w-44"}`}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={folded ? "Expand agents" : "Collapse agents"}
        aria-expanded={!folded}
        onClick={toggle}
        className="max-lg:hidden"
      >
        {folded ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
      </Button>
      {OFFICE_AGENTS.map((agent, i) => {
        const st = stopped ? "error" : statuses[agent];
        return (
          <button
            key={agent}
            type="button"
            aria-pressed={agent === selected}
            aria-label={folded ? AGENT_INFO[agent].name : undefined}
            title={folded ? `${AGENT_INFO[agent].name} · ${DESK_LABEL[st]}` : undefined}
            onClick={() => onSelect(agent === selected ? null : agent)}
            className={`flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left max-lg:shrink-0 max-lg:pr-2.5 transition-colors hover:bg-muted ${folded ? "justify-center" : ""} ${agent === selected ? "bg-brand/10 text-brand" : ""}`}
          >
            <span className="relative shrink-0">
              <Portrait agent={agent} className="block h-7 w-[1.15rem]" />
              <span
                className="absolute -right-0.5 bottom-0 size-1.5 rounded-full ring-2 ring-card"
                style={{ background: STATUS_COLOR[st] }}
              />
            </span>
            {!folded && (
              <>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium">{AGENT_INFO[agent].name}</span>
                  <span className="truncate text-[0.625rem] text-muted-foreground">
                    {stopped ? "Stopped" : DESK_LABEL[st]}
                  </span>
                </span>
                <Kbd className="hidden lg:inline-flex">{i + 1}</Kbd>
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function HudChip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground uppercase tabular-nums ${className}`}
    >
      {children}
    </span>
  );
}
