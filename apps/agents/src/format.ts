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
export function linkButtons(lines: ReadonlyArray<SpikeLine>, webUrl: string): LinkButton[] {
  const base = webUrl.replace(/\/+$/, "");
  if (!/^https:\/\//.test(base) || /^https:\/\/(localhost|127\.|\[::1\])/.test(base)) return [];
  return lines.map((line) => ({
    text: lines.length === 1 ? "View pool on Vexis" : `View ${line.name}`,
    url: `${base}/analytics?pool=${line.poolAddress}`,
  }));
}
