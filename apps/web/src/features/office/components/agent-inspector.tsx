import { type OfficeAgent, PROVIDER_LABEL } from "@vexis/db/office";
import { useEffect, useRef } from "react";
import { AGENT_INFO, DESK_LABEL, type DeskStatus, isLlmAgent, type OfficeView } from "../office";
import { STATUS_COLOR } from "./floor/scene";
import { sprite } from "./floor/sprites";
import { Chip, cost, Section, utcClock } from "./office-ui";

const SHOWN = 4;

/** The selected agent: who it is, what it runs on, what its provider cost today and what it said last. */
export function AgentInspector({
  agent,
  view,
  status,
  stopped,
}: {
  agent: OfficeAgent;
  view: OfficeView;
  status: DeskStatus;
  stopped: boolean;
}) {
  const portrait = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = portrait.current?.getContext("2d");
    if (!c) return;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, 16, 24);
    c.drawImage(sprite(agent, 0, 0, "stand", "idle", false, false), 1, 0);
  }, [agent]);

  const model = isLlmAgent(agent) ? view.config.models[agent] : null;
  const engine = !isLlmAgent(agent)
    ? "Code · runner"
    : model
      ? `LLM · ${PROVIDER_LABEL[model.provider]} · ${model.model}`
      : "LLM · no model";
  const spent = model ? view.spend.filter((r) => r.provider === model.provider).reduce((a, r) => a + r.usd, 0) : null;
  const said = view.messages.filter((m) => m.agent === agent).slice(0, SHOWN);

  return (
    <Section title="Agent">
      <div className="flex items-center gap-3">
        <canvas
          ref={portrait}
          width={16}
          height={24}
          className="h-[84px] w-14 shrink-0 rounded-md border bg-background/60 [image-rendering:pixelated]"
        />
        <div className="min-w-0">
          <div className="font-brand text-[1.05rem] font-bold">{AGENT_INFO[agent].name}</div>
          <div className="text-xs text-muted-foreground">{AGENT_INFO[agent].role}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Chip>
          <span className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[stopped ? "error" : status] }} />
          {stopped ? "Stopped" : DESK_LABEL[status]}
        </Chip>
        <Chip>{engine}</Chip>
        {model && (
          <Chip>
            {PROVIDER_LABEL[model.provider]} today
            <b className="font-mono font-medium text-foreground">{cost(spent)}</b>
          </Chip>
        )}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {said.length === 0 && <li className="text-xs text-muted-foreground">No messages yet.</li>}
        {said.map((m) => (
          <li key={m.id} className="rounded-md border bg-background/60 px-2 py-1 text-xs [overflow-wrap:anywhere]">
            <time className="mr-1.5 font-mono text-[0.625rem] text-muted-foreground">{utcClock(m.at)}</time>
            {m.text}
          </li>
        ))}
      </ul>
    </Section>
  );
}
