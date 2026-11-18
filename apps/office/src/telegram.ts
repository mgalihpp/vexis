import type { ProposalRow } from "@vexis/db/office-queries";
import type { BriefingStats } from "@vexis/shared/briefing";
import { type Decision, PROPOSAL_PARAMS, RiskNotes } from "@vexis/shared/office";
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

/** The card without its expiry: pool, action, range, amount in SOL and USD, the Manager's summary, every guardrail. */
function cardDetails(p: ProposalRow) {
  const name = p.poolName ?? p.poolAddress;
  const lines = [`Proposal: ${p.kind} ${name}`, `Pool ${p.poolAddress}`];
  const open = p.kind === "open" ? PROPOSAL_PARAMS.open.safeParse(p.params) : null;
  if (open?.success) {
    const x = open.data;
    lines.push(
      `Range: bins ${x.lowerBin} to ${x.upperBin} (active ${x.activeBin}), ${x.strategy}${x.singleSidedSol ? ", SOL only" : ""}`,
      `Amount: ${x.amountSol} SOL / ${x.solUsd === null ? DASH : usd(x.amountSol * x.solUsd)}`,
      `Setup: ${x.setupSol === null ? DASH : `${x.setupSol.toFixed(4)} SOL`} (rent and new bin arrays, read on chain)`,
    );
  }
  if (p.positionAddress) lines.push(`Position ${p.positionAddress}`);
  const rebalance = p.kind === "rebalance" ? PROPOSAL_PARAMS.rebalance.safeParse(p.params) : null;
  if (rebalance?.success) {
    const x = rebalance.data;
    lines.push(`New range: bins ${x.lowerBin} to ${x.upperBin} (active ${x.activeBin}), ${x.strategy}`);
  }
  const claim = p.kind === "claim" ? PROPOSAL_PARAMS.claim.safeParse(p.params) : null;
  if (claim?.success) lines.push(`Fees: ${claim.data.feeSol === null ? DASH : `${claim.data.feeSol.toFixed(4)} SOL`}`);
  const close = p.kind === "close" ? PROPOSAL_PARAMS.close.safeParse(p.params) : null;
  if (close?.success) lines.push(`Reason: ${close.data.reason.replaceAll("_", " ")}`);
  if (p.summary) lines.push("", p.summary);
  const risk = RiskNotes.safeParse(p.riskNotes);
  if (risk.success) {
    lines.push("", "Guardrails:", ...risk.data.checks.map((c) => `${c.ok ? "✅" : "❌"} ${c.rule}: ${c.value}`));
    if (risk.data.llm) lines.push(`Risk Manager: ${risk.data.llm.note}`);
  }
  return lines.join("\n");
}

/** The approval card: the details and when its window closes. */
export const cardText = (p: ProposalRow) => `${cardDetails(p)}\n\nExpires ${utcTime(p.expiresAt)}`;

/** What autopilot sends instead of a card: no buttons and no expiry, since nothing waits for the owner. */
export const autopilotText = (p: ProposalRow, nominalSol: number, limitSol: number) =>
  `${cardDetails(p)}\n\n${outcome(p) ?? ""} It moves ${nominalSol.toFixed(4)} SOL, within your ${limitSol} SOL limit.`;

export const cardButtons = (proposalId: string): Button[] => [
  { text: "Approve", callback_data: callbackData("approve", proposalId) },
  { text: "Reject", callback_data: callbackData("reject", proposalId) },
];

/** How the card ends once the proposal stopped waiting; null while it still waits. */
export function outcome(p: Pick<ProposalRow, "status" | "decidedBy" | "simulated" | "signature" | "txError">) {
  const approved = p.decidedBy === "autopilot" ? "✅ Approved by autopilot." : "✅ Approved.";
  switch (p.status) {
    case "draft":
    case "risk_checked":
    case "awaiting_approval":
      return null;
    case "expired":
      return "⌛ Expired before anyone approved it.";
    case "rejected":
      if (p.decidedBy === "kill_switch") return "🛑 Rejected by the kill switch.";
      return p.decidedBy === "risk" ? "❌ Stopped by the guardrails." : "❌ Rejected.";
    case "approved":
    case "executing":
      return approved;
    case "done":
      if (p.simulated) return `${approved} Preview: simulated, nothing was signed.`;
      return p.signature ? `✅ Done: https://solscan.io/tx/${p.signature}` : "✅ Done.";
    case "failed":
      return `⚠️ Failed: ${p.txError ?? "unknown error"}`;
  }
}

/** The card as it reads after the outcome, with its buttons gone. An autopilot notice never had an expiry. */
export const settledText = (p: ProposalRow) =>
  `${p.decidedBy === "autopilot" ? cardDetails(p) : cardText(p)}\n\n${outcome(p) ?? ""}`.trimEnd();

/** The daily briefing as the office bot sends it: the LLM's prose, then the numbers computed in code. */
export function briefingText(b: { headline: string; body: string; stats: BriefingStats }) {
  const s = b.stats;
  const pnl =
    s.closes.count === 0
      ? "no closes"
      : `${s.closes.pnlSol === null ? DASH : `${signed(s.closes.pnlSol)} SOL`} / ${s.closes.pnlUsd === null ? DASH : signedUsd(s.closes.pnlUsd)} over ${s.closes.count} close(s)${s.closes.unknown > 0 ? `, ${s.closes.unknown} unknown` : ""}`;
  return [
    `Daily briefing, ${s.day} (UTC)`,
    "",
    b.headline,
    "",
    b.body,
    "",
    `Realized PnL: ${pnl}`,
    `Proposals: ${s.proposals.total} (${s.proposals.approvedByOwner} approved by you, ${s.proposals.approvedByAutopilot} by autopilot, ${s.proposals.vetoed} vetoed, ${s.proposals.expired} expired)`,
    `Open now: ${s.open.count}, ${s.open.sol.toFixed(3)} SOL at cost`,
    `LLM: ${s.llm.runs} call(s), $${s.llm.usd.toFixed(4)}`,
  ].join("\n");
}

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(4)}`;
const signedUsd = (n: number) => `${n >= 0 ? "+" : "-"}${usd(Math.abs(n))}`;
