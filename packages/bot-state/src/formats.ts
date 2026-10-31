import { z } from "zod";
import type { BotEvent, BotKind, EventKind } from "./model.ts";

type ParsedEvent = Omit<BotEvent, "seq">;

// Raw line shapes, mirrored from each bot's own writer:
// tiang-rebalance-dlmm-bot src/journal.ts, auto-rebalance-dlmm-bot src/activity.ts.
export const TiangEntry = z.discriminatedUnion("kind", [
  z.object({ ts: z.number(), kind: z.literal("decision"), decision: z.string(), detail: z.string() }),
  z.object({
    ts: z.number(),
    kind: z.literal("open"),
    position: z.string(),
    lower: z.number(),
    upper: z.number(),
    signature: z.string().nullable(),
  }),
  z.object({ ts: z.number(), kind: z.literal("close"), position: z.string(), signatures: z.array(z.string()) }),
  z.object({
    ts: z.number(),
    kind: z.literal("rebalance"),
    from: z.string(),
    to: z.string().nullable(),
    closeSignatures: z.array(z.string()),
    openSignature: z.string().nullable(),
  }),
  z.object({ ts: z.number(), kind: z.literal("halt"), reason: z.string() }),
  z.object({ ts: z.number(), kind: z.literal("error"), message: z.string() }),
]);
export type TiangEntry = z.infer<typeof TiangEntry>;

export const AUTO_KINDS = [
  "startup",
  "shutdown",
  "rebalanceNeeded",
  "rebalanced",
  "feesSwept",
  "feesCompounded",
  "failed",
  "paused",
  "resumed",
  "configChanged",
] as const;

export const AutoEntry = z.object({
  // Bot-local wall clock with no zone. Read as the reader's local time,
  // which holds when the dashboard runs on the bot's host.
  at: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  kind: z.enum(AUTO_KINDS),
  title: z.string(),
  detail: z.string().optional(),
  signature: z.string().optional(),
  count: z.number().int().optional(),
});
export type AutoEntry = z.infer<typeof AutoEntry>;

const shortAddr = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

function fromTiang(e: TiangEntry): ParsedEvent {
  switch (e.kind) {
    case "decision":
      return { at: e.ts, kind: "decision", title: e.decision, detail: e.detail };
    case "open":
      return {
        at: e.ts,
        kind: "opened",
        title: "Position opened",
        detail: `bins ${e.lower}–${e.upper}`,
        signature: e.signature ?? undefined,
      };
    case "close":
      return {
        at: e.ts,
        kind: "closed",
        title: "Position closed",
        detail: e.signatures.length > 1 ? `${e.signatures.length} txs` : undefined,
        signature: e.signatures[0],
      };
    case "rebalance":
      return {
        at: e.ts,
        kind: "rebalanced",
        title: "Rebalanced",
        detail: e.to ? `${shortAddr(e.from)} → ${shortAddr(e.to)}` : `closed ${shortAddr(e.from)}`,
        signature: e.openSignature ?? e.closeSignatures[0],
      };
    case "halt":
      return { at: e.ts, kind: "halted", title: "Halted", detail: e.reason };
    case "error":
      return { at: e.ts, kind: "error", title: "Cycle failed", detail: e.message };
  }
}

const autoKind: Record<AutoEntry["kind"], EventKind> = {
  startup: "started",
  shutdown: "stopped",
  rebalanceNeeded: "out-of-range",
  rebalanced: "rebalanced",
  feesSwept: "fees",
  feesCompounded: "fees",
  failed: "error",
  paused: "paused",
  resumed: "resumed",
  configChanged: "config",
};

function fromAuto(e: AutoEntry): ParsedEvent {
  return {
    at: new Date(e.at.replace(" ", "T")).getTime(),
    kind: autoKind[e.kind],
    title: e.title,
    detail: e.detail,
    signature: e.signature,
    repeats: e.count,
  };
}

function lineParser<T>(schema: z.ZodType<T>, map: (entry: T) => ParsedEvent) {
  return (line: string): ParsedEvent | null => {
    if (line.trim() === "") return null;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return null;
    }
    const parsed = schema.safeParse(json);
    return parsed.success ? map(parsed.data) : null;
  };
}

export const journalFormats: Record<BotKind, { file: string; parseLine: (line: string) => ParsedEvent | null }> = {
  tiang: { file: "journal.jsonl", parseLine: lineParser(TiangEntry, fromTiang) },
  "auto-rebalance": { file: "activity.jsonl", parseLine: lineParser(AutoEntry, fromAuto) },
};

export function parseJournal(kind: BotKind, text: string): BotEvent[] {
  const { parseLine } = journalFormats[kind];
  return text.split("\n").flatMap((line, seq) => {
    const event = parseLine(line);
    return event ? [{ ...event, seq }] : [];
  });
}
