import { REBALANCE_STRATEGIES } from "@vexis/db/agents";
import { z } from "zod";

// What each LLM agent must answer. A reply that does not parse is dropped and logged, never repaired or guessed.

export const ScoutDecision = z.object({
  candidates: z
    .array(z.object({ pool: z.string().min(32).max(44), reason: z.string().min(1).max(300) }))
    .min(1)
    .max(5),
});
export type ScoutDecision = z.infer<typeof ScoutDecision>;

/** Bins and size the Strategist picks; the active bin comes from chain, never from the model. */
export const StrategistDecision = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("open"),
    pool: z.string().min(32).max(44),
    strategy: z.enum(REBALANCE_STRATEGIES),
    lowerBin: z.number().int(),
    upperBin: z.number().int(),
    amountSol: z.number().positive(),
    rationale: z.string().min(1).max(600),
  }),
  z.object({ action: z.literal("skip"), reason: z.string().min(1).max(300) }),
]);
export type StrategistDecision = z.infer<typeof StrategistDecision>;

export const RiskDecision = z.object({ veto: z.boolean(), note: z.string().min(1).max(400) });
export type RiskDecision = z.infer<typeof RiskDecision>;

export const ManagerDecision = z.object({ summary: z.string().min(1).max(800) });
export type ManagerDecision = z.infer<typeof ManagerDecision>;

export type Parsed<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: string };

/** The one JSON object in a reply, allowing a ```json fence or prose around it. */
function jsonOf(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end < start) throw new Error("no JSON object");
  return JSON.parse(text.slice(start, end + 1));
}

export function parseDecision<A>(schema: z.ZodType<A>, text: string): Parsed<A> {
  let raw: unknown;
  try {
    raw = jsonOf(text);
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "not JSON" };
  }
  const result = schema.safeParse(raw);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, error: result.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ") };
}
