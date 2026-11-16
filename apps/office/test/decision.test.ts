import { describe, expect, test } from "bun:test";
import type { z } from "zod";
import { ManagerDecision, parseDecision, RiskDecision, ScoutDecision, StrategistDecision } from "../src/decision.ts";
import { POOL } from "./fakes.ts";

describe("parseDecision", () => {
  test("reads the JSON object out of a fence or prose", () => {
    const reply = 'Here you go:\n```json\n{"veto": false, "note": "Fine."}\n```';
    expect(parseDecision(RiskDecision, reply)).toEqual({ ok: true, value: { veto: false, note: "Fine." } });
  });

  test("a strategist open and a skip both parse", () => {
    const open = {
      action: "open",
      pool: POOL,
      strategy: "Curve",
      lowerBin: -5,
      upperBin: 5,
      amountSol: 0.5,
      rationale: "x",
    };
    expect(parseDecision(StrategistDecision, JSON.stringify(open)).ok).toBe(true);
    expect(parseDecision(StrategistDecision, '{"action":"skip","reason":"Nothing good."}').ok).toBe(true);
  });

  test.each<[string, z.ZodType, string]>([
    ["no JSON", ScoutDecision, "I would pick JUP-SOL."],
    ["broken JSON", ScoutDecision, '{"candidates": [}'],
    ["no candidates", ScoutDecision, '{"candidates": []}'],
    ["six candidates", ScoutDecision, JSON.stringify({ candidates: Array(6).fill({ pool: POOL, reason: "r" }) })],
    ["not an address", ScoutDecision, '{"candidates": [{"pool": "JUP-SOL", "reason": "r"}]}'],
    [
      "unknown strategy",
      StrategistDecision,
      JSON.stringify({
        action: "open",
        pool: POOL,
        strategy: "Wide",
        lowerBin: 0,
        upperBin: 1,
        amountSol: 1,
        rationale: "r",
      }),
    ],
    [
      "fractional bin",
      StrategistDecision,
      JSON.stringify({
        action: "open",
        pool: POOL,
        strategy: "Spot",
        lowerBin: 0.5,
        upperBin: 1,
        amountSol: 1,
        rationale: "r",
      }),
    ],
    [
      "zero size",
      StrategistDecision,
      JSON.stringify({
        action: "open",
        pool: POOL,
        strategy: "Spot",
        lowerBin: 0,
        upperBin: 1,
        amountSol: 0,
        rationale: "r",
      }),
    ],
    ["veto as text", RiskDecision, '{"veto": "no", "note": "n"}'],
    ["empty summary", ManagerDecision, '{"summary": ""}'],
  ])("drops %s", (_, schema, text) => {
    expect(parseDecision(schema, text).ok).toBe(false);
  });
});
