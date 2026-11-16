import { type OfficeAgent, PROVIDER_LABEL } from "@vexis/db/office";
import { PROMPT_TEXT } from "@vexis/db/office-prompts";
import { CrosshairIcon, GripHorizontalIcon, ListIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { AGENT_INFO, DESK_LABEL, type DeskStatus, isLlmAgent, type OfficeView } from "../office";
import { STATUS_COLOR } from "./floor/scene";
import { sprite } from "./floor/sprites";
import { cost, utcClock } from "./office-ui";
import { ThreadDetail } from "./thread";

const SHOWN = 3;

/** The agent's standing sprite, drawn once per agent at 16×24 and scaled up without smoothing. */
export function Portrait({ agent, className }: { agent: OfficeAgent; className: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 16, 24);
    c.drawImage(sprite(agent, 0, 0, "stand", "idle", false), 1, 0);
  }, [agent]);
  return <canvas ref={ref} width={16} height={24} aria-hidden className={`[image-rendering:pixelated] ${className}`} />;
}

/** The card that opens over an agent on the floor: who it is, what it runs on, its cost today and what it said. */
export function AgentCard({
  agent,
  view,
  status,
  stopped,
  now,
  following,
  onFollow,
  onShowLog,
  onClose,
}: {
  agent: OfficeAgent;
  view: OfficeView;
  status: DeskStatus;
  stopped: boolean;
  now: number;
  following: boolean;
  onFollow: () => void;
  onShowLog: () => void;
  onClose: () => void;
}) {
  const model = isLlmAgent(agent) ? view.config.models[agent] : null;
  const prompt = isLlmAgent(agent) ? PROMPT_TEXT[agent] : null;
  const thread = isLlmAgent(agent) ? view.threads.find((t) => t.agent === agent) : undefined;
  const spent = model ? view.spend.filter((r) => r.provider === model.provider).reduce((a, r) => a + r.usd, 0) : null;
  const said = view.messages.filter((m) => m.agent === agent).slice(0, SHOWN);
  const color = STATUS_COLOR[stopped ? "error" : status];

  const rows: [string, string, string?][] = [
    ["Engine", isLlmAgent(agent) ? (model ? PROVIDER_LABEL[model.provider] : "No model") : "Code runner"],
  ];
  if (model) rows.push(["Model", model.model], [`${PROVIDER_LABEL[model.provider]} today`, cost(spent)]);

  return (
    <div className="flex flex-col gap-2.5">
      <div
        data-card-grip
        className="sticky top-0 z-10 -mx-2.5 -mt-2.5 flex cursor-grab touch-none items-start gap-2.5 border-b bg-popover px-2.5 pt-2.5 pb-2.5 active:cursor-grabbing"
      >
        <div
          className="relative grid size-14 shrink-0 place-items-center overflow-hidden rounded-md border"
          style={{ background: `radial-gradient(circle at 50% 70%, ${color}40, transparent 70%)` }}
        >
          <Portrait agent={agent} className="h-12 w-8" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-brand text-sm font-bold tracking-wide">{AGENT_INFO[agent].name}</div>
          <div className="text-[0.6875rem] leading-snug text-muted-foreground">{AGENT_INFO[agent].role}</div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-[0.6875rem] font-medium">
            <span className="size-1.5 rounded-full" style={{ background: color }} />
            {stopped ? "Stopped" : DESK_LABEL[status]}
          </div>
        </div>
        <button
          type="button"
          data-card-grip
          title="Drag card · double-click to re-anchor"
          aria-label="Drag card (double-click to re-anchor, arrow keys to nudge)"
          className="shrink-0 cursor-grab rounded p-0.5 text-muted-foreground/45 active:cursor-grabbing"
        >
          <GripHorizontalIcon className="size-3.5" />
        </button>
        <Button variant="ghost" size="icon-xs" aria-label="Close" onClick={onClose}>
          <XIcon />
        </Button>
      </div>

      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border bg-background/60 px-2.5 py-2">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="contents">
            <dt className="text-[0.6875rem] text-muted-foreground">{label}</dt>
            <dd className={`m-0 truncate text-right tabular-nums text-[0.6875rem] ${tone ?? ""}`}>{value}</dd>
          </div>
        ))}
      </dl>

      {thread ? (
        <div className="flex flex-col gap-1">
          <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">
            Last exchange
          </span>
          <ThreadDetail thread={thread} now={now} />
        </div>
      ) : (
        prompt && (
          <details className="rounded-md border bg-background/60 px-2.5 py-2">
            <summary className="cursor-pointer text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase select-none">
              System prompt · {prompt.version}
            </summary>
            <pre className="m-0 mt-1.5 overflow-x-auto font-mono text-[0.625rem] leading-relaxed whitespace-pre-wrap text-muted-foreground">
              {prompt.system}
            </pre>
          </details>
        )
      )}

      <div className="flex flex-col gap-1">
        <span className="text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase">Last said</span>
        {said.length === 0 && <p className="text-[0.6875rem] text-muted-foreground">Nothing yet.</p>}
        {said.map((m) => (
          <p key={m.id} className="text-[0.6875rem] leading-snug [overflow-wrap:anywhere]">
            <time className="mr-1.5 tabular-nums text-[0.625rem] text-muted-foreground">
              {utcClock(m.at).slice(0, 5)}
            </time>
            {m.text}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Button variant="outline" size="sm" aria-pressed={following} onClick={onFollow}>
          <CrosshairIcon />
          {following ? "Following" : "Follow"}
        </Button>
        <Button variant="outline" size="sm" onClick={onShowLog}>
          <ListIcon />
          Show in log
        </Button>
      </div>
    </div>
  );
}
