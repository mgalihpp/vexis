import { PROVIDER_LABEL } from "@vexis/shared/office";
import { timeAgo } from "@/features/portfolio/money";
import { prettyReply, type ThreadView, tokenCount } from "../office";
import { cost, DASH, utcClock } from "./office-ui";

const pre =
  "m-0 mt-1.5 overflow-x-auto font-mono text-[0.625rem] leading-relaxed whitespace-pre-wrap text-muted-foreground";
const summary =
  "cursor-pointer text-[0.625rem] font-semibold tracking-wider text-muted-foreground uppercase select-none";

/** One stored message, collapsed until asked for: a desk sends a system and a user message and gets one answer. */
function Message({ name, text }: { name: string; text: string }) {
  return (
    <details className="rounded-md border bg-background/60 px-2.5 py-2">
      <summary className={summary}>
        {name} · {text.length} chars
      </summary>
      <pre className={pre}>{text}</pre>
    </details>
  );
}

/**
 * One desk's last exchange: the two messages it was sent, the answer it gave and that call's metadata. A desk has no
 * tools, so there is no tool call to show: one request, one JSON object back.
 */
export function ThreadDetail({ thread, now }: { thread: ThreadView; now: number }) {
  const rows: [string, string, string?][] = [
    ["Model", `${PROVIDER_LABEL[thread.provider]} · ${thread.model}`],
    ["Prompt", thread.promptVersion],
    ["Sent", `${utcClock(thread.at)} UTC · ${timeAgo(thread.at, now)}`],
    ["Took", `${(thread.durationMs / 1000).toFixed(1)}s`],
    ["Cost", cost(thread.costUsd)],
  ];
  if (thread.inputTokens !== null || thread.outputTokens !== null) {
    rows.push([
      "Tokens",
      `${thread.inputTokens === null ? DASH : tokenCount(thread.inputTokens)} in / ${
        thread.outputTokens === null ? DASH : tokenCount(thread.outputTokens)
      } out`,
    ]);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-md border bg-background/60 px-2.5 py-2">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="contents">
            <dt className="text-[0.6875rem] text-muted-foreground">{label}</dt>
            <dd className={`m-0 truncate text-right tabular-nums text-[0.6875rem] ${tone ?? ""}`}>{value}</dd>
          </div>
        ))}
      </dl>
      {thread.error && <p className="text-[0.6875rem] text-loss [overflow-wrap:anywhere]">{thread.error}</p>}
      <Message name="System" text={thread.system} />
      <Message name="User" text={thread.user} />
      {thread.reply === null ? (
        <p className="text-[0.6875rem] text-muted-foreground">No answer: the call failed before one arrived.</p>
      ) : (
        <Message name="Reply" text={prettyReply(thread.reply)} />
      )}
      <p className="text-[0.625rem] leading-snug text-muted-foreground">
        No tool calls: a desk sends one request with these two messages and reads one JSON answer.
      </p>
    </div>
  );
}
