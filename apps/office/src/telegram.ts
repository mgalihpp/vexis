import { type Decision, PROPOSAL_PARAMS, RiskNotes } from "@vexis/db/office";
import type { ProposalRow } from "@vexis/db/office-queries";
import { z } from "zod";

// The office's Telegram card and what comes back from it. Pure: the runtime sends, polls and decides.

/** The parts of a Bot API update the office reads; everything else is ignored. */
export const Update = z.object({
  update_id: z.number().int(),
  message: z.object({ chat: z.object({ id: z.number() }), text: z.string().optional() }).optional(),
  callback_query: z
    .object({
      id: z.string(),
      data: z.string().optional(),
      message: z.object({ message_id: z.number(), chat: z.object({ id: z.number() }) }).optional(),
    })
    .optional(),
});
export type Update = z.infer<typeof Update>;

/** A button on the card: Telegram caps callback data at 64 bytes, and this is at most 44. */
export type Button = { readonly text: string; readonly callback_data: string };

export const callbackData = (decision: Decision, proposalId: string) => `${decision}:${proposalId}`;

const CALLBACK = /^(approve|reject):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function parseCallback(data: string | undefined) {
  const match = data ? CALLBACK.exec(data) : null;
  if (!match?.[1] || !match[2]) return null;
  return { decision: match[1] as Decision, proposalId: match[2] };
}

export const COMMANDS = ["stop", "resume", "help"] as const;
export type Command = (typeof COMMANDS)[number];

/** `/stop` and `/stop@my_bot` both count; any other slash command is answered with help. Plain text is not a command. */
export function parseCommand(text: string | undefined): Command | null {
  const match = text ? /^\/([a-z_]+)(@\w+)?(\s|$)/i.exec(text.trim()) : null;
  if (!match?.[1]) return null;
  const name = match[1].toLowerCase();
  return (COMMANDS as readonly string[]).includes(name) ? (name as Command) : "help";
}

/** What one update asks of the office. Only the linked chat decides or commands; another chat's button is just answered. */
export type Inbound =
  | { readonly _tag: "decide"; readonly callbackId: string; readonly decision: Decision; readonly proposalId: string }
  | { readonly _tag: "dismiss"; readonly callbackId: string }
  | { readonly _tag: "command"; readonly command: Command }
  | { readonly _tag: "ignore" };

export function readUpdate(update: Update, linkedChat: number): Inbound {
  const query = update.callback_query;
  if (query) {
    const parsed = parseCallback(query.data);
    if (!parsed || query.message?.chat.id !== linkedChat) return { _tag: "dismiss", callbackId: query.id };
    return { _tag: "decide", callbackId: query.id, ...parsed };
  }
  const message = update.message;
  if (!message || message.chat.id !== linkedChat) return { _tag: "ignore" };
  const command = parseCommand(message.text);
  return command ? { _tag: "command", command } : { _tag: "ignore" };
}

export const HELP_TEXT =
  "Approve or reject each proposal with the buttons on its card. /stop pauses the office and rejects every proposal not yet executing; /resume starts it again.";

const DASH = "—";
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const utcTime = (d: Date) => `${d.toISOString().slice(11, 16)} UTC`;

/** The card: pool, action, range, amount in SOL and USD, the Manager's summary, every guardrail, the expiry. */
export function cardText(p: ProposalRow) {
  const name = p.poolName ?? p.poolAddress;
  const lines = [`Proposal: ${p.kind} ${name}`, `Pool ${p.poolAddress}`];
  const open = p.kind === "open" ? PROPOSAL_PARAMS.open.safeParse(p.params) : null;
  if (open?.success) {
    const x = open.data;
    lines.push(
      `Range: bins ${x.lowerBin} to ${x.upperBin} (active ${x.activeBin}), ${x.strategy}`,
      `Amount: ${x.amountSol} SOL / ${x.solUsd === null ? DASH : usd(x.amountSol * x.solUsd)}`,
    );
  }
  if (p.summary) lines.push("", p.summary);
  const risk = RiskNotes.safeParse(p.riskNotes);
  if (risk.success) {
    lines.push("", "Guardrails:", ...risk.data.checks.map((c) => `${c.ok ? "✅" : "❌"} ${c.rule}: ${c.value}`));
    if (risk.data.llm) lines.push(`Risk Manager: ${risk.data.llm.note}`);
  }
  lines.push("", `Expires ${utcTime(p.expiresAt)}`);
  return lines.join("\n");
}

export const cardButtons = (proposalId: string): Button[] => [
  { text: "Approve", callback_data: callbackData("approve", proposalId) },
  { text: "Reject", callback_data: callbackData("reject", proposalId) },
];

/** How the card ends once the proposal stopped waiting; null while it still waits. */
export function outcome(p: Pick<ProposalRow, "status" | "decidedBy">) {
  switch (p.status) {
    case "draft":
    case "risk_checked":
    case "awaiting_approval":
      return null;
    case "expired":
      return "⌛ Expired before anyone approved it.";
    case "rejected":
      return p.decidedBy === "kill_switch" ? "🛑 Rejected by the kill switch." : "❌ Rejected.";
    default:
      return "✅ Approved.";
  }
}

/** The card as it reads after the outcome, with its buttons gone. */
export const settledText = (p: ProposalRow) => `${cardText(p)}\n\n${outcome(p) ?? ""}`.trimEnd();
