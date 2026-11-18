import { z } from "zod";
import { type Decider, type MessageTone, type ProposalStatus, utcDayStart } from "./office.ts";

// The Manager's daily briefing: when it is due, and the numbers it reports. Every number is computed here, in code,
// and stored with the briefing; the LLM only writes the prose around them.

const DAY_MS = 86_400_000;

/**
 * The briefing waits this long past 00:00 UTC, so the Bookkeeper (10 minutes after a close, then a 1-minute schedule)
 * has booked yesterday's late closes before they are counted.
 */
export const BRIEFING_DELAY_MS = 30 * 60_000;
/** LLM calls a day's briefing may make, an hour apart, before it is given up; a failing provider costs at most this. */
export const BRIEFING_ATTEMPTS = 3;
export const BRIEFING_RETRY_MS = 60 * 60_000;

/** `YYYY-MM-DD` of the UTC day starting at `day`, the briefing's key. */
export const dayKey = (day: Date) => day.toISOString().slice(0, 10);

/**
 * The UTC day to brief on at `now`: yesterday, once `BRIEFING_DELAY_MS` into today, and only when the office existed
 * before today started. Null otherwise. An office that missed days briefs on yesterday only.
 */
export function briefingDay(now: number, officeCreatedAt: Date): Date | null {
  const today = utcDayStart(now).getTime();
  if (now - today < BRIEFING_DELAY_MS || officeCreatedAt.getTime() >= today) return null;
  return new Date(today - DAY_MS);
}

/** Whether to call the Manager now: the day has no briefing yet and the day's attempts are neither spent nor recent. */
export function briefingDue(
  day: Date | null,
  lastBriefed: string | null,
  attempts: { readonly count: number; readonly lastAt: Date | null },
  now: number,
) {
  if (day === null || (lastBriefed !== null && lastBriefed >= dayKey(day))) return false;
  if (attempts.count >= BRIEFING_ATTEMPTS) return false;
  return attempts.lastAt === null || now - attempts.lastAt.getTime() >= BRIEFING_RETRY_MS;
}

const Count = z.number().int().min(0);
const Sum = z.number().nullable();

/** `office_briefings.stats`. Parsed on read; a PnL sum is null when no close in it has a known PnL. */
export const BriefingStats = z.object({
  day: z.string(),
  proposals: z.object({
    total: Count,
    approvedByOwner: Count,
    approvedByAutopilot: Count,
    vetoed: Count,
    rejected: Count,
    expired: Count,
    done: Count,
    failed: Count,
  }),
  closes: z.object({ count: Count, pnlSol: Sum, pnlUsd: Sum, unknown: Count }),
  open: z.object({ count: Count, sol: z.number() }),
  llm: z.object({ usd: z.number(), runs: Count, failed: Count }),
  warnings: Count,
});
export type BriefingStats = z.infer<typeof BriefingStats>;

export type BriefingFacts = {
  readonly day: Date;
  /** Proposals created that day, with where they stand now. */
  readonly proposals: ReadonlyArray<{ readonly status: ProposalStatus; readonly decidedBy: Decider | null }>;
  /** Journal rows closed that day. */
  readonly closes: ReadonlyArray<{ readonly pnlSol: number | null; readonly pnlUsd: number | null }>;
  /** Positions open now, at cost. */
  readonly open: ReadonlyArray<{ readonly amountSol: number }>;
  /** LLM calls made that day. */
  readonly runs: ReadonlyArray<{ readonly costUsd: number | null; readonly error: string | null }>;
  readonly messages: ReadonlyArray<{ readonly tone: MessageTone | null }>;
};

const APPROVED: ReadonlySet<ProposalStatus> = new Set(["approved", "executing", "done", "failed"]);

/** A sum of the known values only; null when none is known. */
function knownSum(values: ReadonlyArray<number | null>) {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : known.reduce((a, v) => a + v, 0);
}

export function briefingStats(f: BriefingFacts): BriefingStats {
  const count = (pred: (p: BriefingFacts["proposals"][number]) => boolean) => f.proposals.filter(pred).length;
  return {
    day: dayKey(f.day),
    proposals: {
      total: f.proposals.length,
      approvedByOwner: count((p) => APPROVED.has(p.status) && p.decidedBy === "owner"),
      approvedByAutopilot: count((p) => APPROVED.has(p.status) && p.decidedBy === "autopilot"),
      vetoed: count((p) => p.status === "rejected" && p.decidedBy === "risk"),
      rejected: count((p) => p.status === "rejected" && p.decidedBy !== "risk"),
      expired: count((p) => p.status === "expired"),
      done: count((p) => p.status === "done"),
      failed: count((p) => p.status === "failed"),
    },
    closes: {
      count: f.closes.length,
      pnlSol: knownSum(f.closes.map((c) => c.pnlSol)),
      pnlUsd: knownSum(f.closes.map((c) => c.pnlUsd)),
      unknown: f.closes.filter((c) => c.pnlSol === null).length,
    },
    open: { count: f.open.length, sol: f.open.reduce((a, j) => a + j.amountSol, 0) },
    llm: {
      usd: f.runs.reduce((a, r) => a + (r.costUsd ?? 0), 0),
      runs: f.runs.length,
      failed: f.runs.filter((r) => r.error !== null).length,
    },
    warnings: f.messages.filter((m) => m.tone === "warn" || m.tone === "bad").length,
  };
}
