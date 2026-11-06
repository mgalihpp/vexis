import type { FeeMode } from "@vexis/db/agents";
import type { Spike } from "./spike.ts";

const oneDecimal = (n: number) => n.toFixed(1);

/** `$850`, `$18.4k`, `$1.2M`. */
export function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${oneDecimal(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${oneDecimal(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

export type SpikeLine = {
  readonly name: string;
  readonly binStep: number | undefined;
  readonly poolAddress: string;
  /** Minutes in the baseline window, for the "Median 30m" label. */
  readonly baselineMin: number;
  readonly spike: Spike;
};

/** Telegram HTML mode only needs these three escaped. */
export const escapeHtml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

/** One pool as a labelled block; the message is HTML (see `Telegram.send`). */
export function formatSpike(line: SpikeLine): string {
  const { vol1m, baseline, ratio } = line.spike;
  const rows = [
    `Volume 1m: <b>${formatUsd(vol1m)}</b>`,
    `Median ${line.baselineMin}m: ${formatUsd(baseline)}`,
    `Spike: <b>${Number.isFinite(ratio) ? `${oneDecimal(ratio)}×` : "from zero"}</b>`,
    ...(line.binStep === undefined ? [] : [`Bin step: ${line.binStep}`]),
  ];
  return [`⚡ <b>Volume spike</b> ${escapeHtml(line.name)}`, "", ...rows].join("\n");
}

/** One message per agent per cycle, however many pools spiked. */
export function formatMessage(lines: ReadonlyArray<SpikeLine>): string {
  return lines.map(formatSpike).join("\n\n");
}

export type LinkButton = { readonly text: string; readonly url: string };

/**
 * Buttons under the message, one per pool. Telegram refuses button URLs it cannot reach, so a local
 * `VEXIS_WEB_URL` (dev) gives none and the alert goes out as text only.
 */
export function linkButtons(
  lines: ReadonlyArray<Pick<SpikeLine, "name" | "poolAddress">>,
  webUrl: string,
): LinkButton[] {
  const base = webUrl.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(base) || /^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|\[::1\])/.test(base)) {
    return [];
  }
  return lines.map((line) => ({
    text: lines.length === 1 ? "View pool on Vexis" : `View ${line.name}`,
    url: `${base}/analytics?pool=${line.poolAddress}`,
  }));
}

export type RebalanceLine = {
  readonly name: string;
  readonly poolAddress: string;
  readonly activeBinId: number;
  readonly from: { readonly lowerBinId: number; readonly upperBinId: number };
  readonly to: { readonly lowerBinId: number; readonly upperBinId: number };
  readonly strategy: string;
  readonly slippageBps: number;
  readonly feeMode: FeeMode;
};

const FEE_MODE_TEXT: Record<FeeMode, string> = {
  keep: "kept in the wallet",
  compound: "compounded into the position",
  sweep: "swept to SOL",
};

/** `0.0123 SOL`. */
export const formatSol = (sol: number) => `${sol.toLocaleString("en-US", { maximumFractionDigits: 4 })} SOL`;

const rangeRows = (line: RebalanceLine, moved: string) => [
  `Active bin: <b>${line.activeBinId}</b>`,
  `Range: ${line.from.lowerBinId} to ${line.from.upperBinId}`,
  `${moved}: <b>${line.to.lowerBinId} to ${line.to.upperBinId}</b>`,
  `${line.strategy}, slippage ${line.slippageBps} bps`,
];

export const solscanTx = (signature: string) => `https://solscan.io/tx/${signature}`;

/** A position that left its range and the range it would move to, with the agent in preview (dry run). */
export function formatRebalancePreview(line: RebalanceLine): string {
  return [
    `🔁 <b>Out of range</b> ${escapeHtml(line.name)}`,
    "",
    ...rangeRows(line, "Would move to"),
    `Fees: ${FEE_MODE_TEXT[line.feeMode]}`,
    "",
    "<i>Preview only: no transaction was sent.</i>",
  ].join("\n");
}

/** Long enough for an Anchor error with its owners; Telegram caps a message at 4096 characters. */
const MAX_ERROR = 500;
const shortError = (error: string) => escapeHtml(error.length > MAX_ERROR ? `${error.slice(0, MAX_ERROR)}…` : error);

/** How the fee step after a rebalance or claim went, as one line for the message. */
export type FeeStep =
  | { readonly _tag: "done"; readonly mode: FeeMode; readonly signature: string | null }
  | { readonly _tag: "failed"; readonly mode: FeeMode; readonly error: string };

function feeStepLine(step: FeeStep): string {
  const what = step.mode === "sweep" ? "Sweep to SOL" : "Compound";
  if (step._tag === "failed")
    return `⚠️ ${what} failed; the fees stay in the wallet.\n<code>${shortError(step.error)}</code>`;
  if (step.signature === null) return `${what}: nothing to do.`;
  return `Fees ${FEE_MODE_TEXT[step.mode]}: <a href="${solscanTx(step.signature)}">Solscan</a>`;
}

/** A live rebalance that landed, with the fee step that followed it, if any. */
export function formatRebalanceSent(line: RebalanceLine, signature: string, fees?: FeeStep): string {
  return [
    `✅ <b>Rebalanced</b> ${escapeHtml(line.name)}`,
    "",
    ...rangeRows(line, "Moved to"),
    "",
    `<a href="${solscanTx(signature)}">View transaction on Solscan</a>`,
    ...(fees ? ["", feeStepLine(fees)] : []),
  ].join("\n");
}

export type ClaimLine = {
  readonly name: string;
  readonly poolAddress: string;
  /** What the fees were worth when the agent decided to claim. */
  readonly feeSol: number;
  readonly thresholdSol: number;
};

/** An in-range fee claim: landed (with its fee step) or failed. A failed claim never pauses the agent. */
export function formatFeesClaimed(
  line: ClaimLine,
  outcome:
    | { readonly _tag: "sent"; readonly signature: string; readonly fees: FeeStep }
    | { readonly _tag: "failed"; readonly error: string },
): string {
  const head = [`Unclaimed fees: <b>${formatSol(line.feeSol)}</b>`, `Claim threshold: ${formatSol(line.thresholdSol)}`];
  if (outcome._tag === "failed") {
    return [
      `⚠️ <b>Fee claim failed</b> ${escapeHtml(line.name)}`,
      "",
      ...head,
      "",
      `<code>${shortError(outcome.error)}</code>`,
      "",
      "Trying again after the cooldown while the fees stay above the threshold.",
    ].join("\n");
  }
  return [
    `💰 <b>Fees claimed</b> ${escapeHtml(line.name)}`,
    "",
    ...head,
    "",
    `<a href="${solscanTx(outcome.signature)}">View claim on Solscan</a>`,
    "",
    feeStepLine(outcome.fees),
  ].join("\n");
}

/** The agent paused itself because the wallet cannot pay for live actions. */
export function formatLowSol(name: string, balanceSol: number, reserveSol: number): string {
  return [
    `🪫 <b>Low SOL</b> ${escapeHtml(name)}`,
    "",
    `The agent wallet holds <b>${formatSol(balanceSol)}</b>, below the ${formatSol(reserveSol)} reserve kept for transaction fees and rent.`,
    "",
    "<b>Agent paused.</b> Top up the wallet, then resume the agent in Vexis.",
  ].join("\n");
}

/** A live rebalance that failed, and what happens next: another try after the cooldown, or a pause. */
export function formatRebalanceFailed(
  line: RebalanceLine,
  error: string,
  next: { readonly paused: true; readonly failures: number } | { readonly paused: false; readonly cooldownSec: number },
): string {
  return [
    `⚠️ <b>Rebalance failed</b> ${escapeHtml(line.name)}`,
    "",
    ...rangeRows(line, "Tried to move to"),
    "",
    `<code>${shortError(error)}</code>`,
    "",
    next.paused
      ? `<b>Agent paused</b> after ${next.failures} failed rebalances in a row. Check the wallet and the error, then resume it in Vexis.`
      : `Trying again ${next.cooldownSec < 60 ? "next minute" : `after the ${Math.round(next.cooldownSec / 60)} min cooldown`} if the position is still out of range.`,
  ].join("\n");
}
