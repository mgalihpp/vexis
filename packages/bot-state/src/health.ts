import type { BotActivity, BotEvent, BotHealth, BotId, Snapshot } from "./model.ts";

export function deriveHealth(input: {
  haltReason: string | null;
  snapshot: Snapshot | null;
  now: number;
  staleAfterMs: number;
}): BotHealth {
  if (input.haltReason !== null) return { state: "halted", reason: input.haltReason };
  if (input.snapshot === null) return { state: "unknown" };
  const ageMs = Math.max(0, input.now - input.snapshot.at);
  return ageMs > input.staleAfterMs ? { state: "stale", ageMs } : { state: "live", ageMs };
}

export function isInRange(snapshot: Snapshot): boolean | null {
  const p = snapshot.position;
  if (p === null) return null;
  return snapshot.activeBin >= p.lower && snapshot.activeBin <= p.upper;
}

export function tallyActivity(id: BotId, events: BotEvent[], since: number): BotActivity {
  const tally: BotActivity = { id, rebalances: 0, errors: 0, feeClaims: 0 };
  for (const e of events) {
    if (e.at < since) continue;
    const n = e.repeats ?? 1;
    if (e.kind === "rebalanced") tally.rebalances += n;
    else if (e.kind === "error") tally.errors += n;
    else if (e.kind === "fees") tally.feeClaims += n;
  }
  return tally;
}
