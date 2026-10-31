import { z } from "zod";

export const BotKind = z.enum(["tiang", "auto-rebalance"]);
export type BotKind = z.infer<typeof BotKind>;

export const BotId = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .brand<"BotId">();
export type BotId = z.infer<typeof BotId>;

export const BotSource = z.object({
  id: BotId,
  name: z.string().min(1),
  kind: BotKind,
  dir: z.string().min(1),
  staleAfterMs: z.number().int().positive().default(180_000),
});
export type BotSource = z.infer<typeof BotSource>;

export const BotsFile = z.object({ bots: z.array(BotSource) });

export const EVENT_KINDS = [
  "started",
  "stopped",
  "decision",
  "out-of-range",
  "opened",
  "closed",
  "rebalanced",
  "fees",
  "paused",
  "resumed",
  "config",
  "halted",
  "error",
] as const;
export const EventKind = z.enum(EVENT_KINDS);
export type EventKind = z.infer<typeof EventKind>;

export interface BotEvent {
  at: number;
  kind: EventKind;
  title: string;
  detail?: string;
  signature?: string;
  repeats?: number;
  /** Line number in the journal file; unique within one read. */
  seq: number;
}

// The one file both bots still need to write: their latest observation,
// rewritten every cycle. Its age is the heartbeat the dashboard trusts,
// because neither journal is written on a healthy idle cycle.
export const Snapshot = z.object({
  at: z.number(),
  pool: z.string(),
  pair: z.string().optional(),
  activeBin: z.number().int(),
  position: z
    .object({
      address: z.string(),
      lower: z.number().int(),
      upper: z.number().int(),
    })
    .nullable(),
  wallet: z.object({ sol: z.string(), x: z.string(), y: z.string() }),
  fees: z.object({ x: z.string(), y: z.string() }).optional(),
});
export type Snapshot = z.infer<typeof Snapshot>;

export type BotHealth =
  | { state: "halted"; reason: string }
  | { state: "live"; ageMs: number }
  | { state: "stale"; ageMs: number }
  | { state: "unknown" };

export interface BotSummary {
  id: BotId;
  name: string;
  kind: BotKind;
  health: BotHealth;
  snapshot: Snapshot | null;
  lastEvent: BotEvent | null;
}

export interface BotActivity {
  id: BotId;
  rebalances: number;
  errors: number;
  feeClaims: number;
}
