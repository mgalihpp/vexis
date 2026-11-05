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
  readonly spike: Spike;
};

/** `⚡ DOGE-SOL bin 25 — $18.4k in 1 minute (6.2× normal, baseline $2.9k)` plus the analytics link. */
export function formatSpike(line: SpikeLine, webUrl: string): string {
  const bin = line.binStep === undefined ? "" : ` bin ${line.binStep}`;
  const { vol1m, baseline, ratio } = line.spike;
  const against = Number.isFinite(ratio)
    ? `${oneDecimal(ratio)}× normal, baseline ${formatUsd(baseline)}`
    : `up from a ${formatUsd(baseline)} baseline`;
  const link = `${webUrl.replace(/\/+$/, "")}/analytics?pool=${line.poolAddress}`;
  return `⚡ ${line.name}${bin} — ${formatUsd(vol1m)} in 1 minute (${against})\n${link}`;
}

/** One message per agent per cycle, however many pools spiked. */
export function formatMessage(lines: ReadonlyArray<SpikeLine>, webUrl: string): string {
  return lines.map((line) => formatSpike(line, webUrl)).join("\n\n");
}
