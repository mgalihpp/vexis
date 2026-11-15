import { describe, expect, it } from "bun:test";
import {
  AgentModel,
  canTransition,
  FINAL_STATUSES,
  PROPOSAL_STATUSES,
  parseGuardrails,
  parseModels,
  parseProposalParams,
  runCost,
  transition,
  utcDayStart,
} from "./office.ts";

describe("proposal lifecycle", () => {
  it.each([
    ["draft", "risk_checked"],
    ["draft", "rejected"],
    ["risk_checked", "awaiting_approval"],
    ["awaiting_approval", "approved"],
    ["awaiting_approval", "expired"],
    ["approved", "executing"],
    ["approved", "rejected"],
    ["executing", "done"],
    ["executing", "failed"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(transition(from, to)).toBe(to);
  });

  it.each([
    ["draft", "approved"],
    ["draft", "executing"],
    ["awaiting_approval", "executing"],
    ["executing", "rejected"],
    ["done", "failed"],
    ["expired", "approved"],
  ] as const)("refuses %s → %s", (from, to) => {
    expect(() => transition(from, to)).toThrow();
  });

  it("final statuses go nowhere", () => {
    expect([...FINAL_STATUSES].sort()).toEqual(["done", "expired", "failed", "rejected"]);
    for (const from of FINAL_STATUSES) for (const to of PROPOSAL_STATUSES) expect(canTransition(from, to)).toBe(false);
  });
});

describe("models and cost", () => {
  it("prices a call from the table", () => {
    expect(runCost("claude", "claude-sonnet-5-5", 1_000_000, 100_000)).toBeCloseTo(3);
    expect(runCost("deepseek", "deepseek-flash", 10_000, 2_000)).toBeCloseTo(0.0054);
  });

  it("an unlisted model has no cost and cannot be picked", () => {
    expect(runCost("openai", "gpt-unknown", 10, 10)).toBeNull();
    expect(AgentModel.safeParse({ provider: "openai", model: "gpt-unknown" }).success).toBe(false);
    expect(AgentModel.safeParse({ provider: "openai", model: "gpt-6-luna" }).success).toBe(true);
  });

  it("no agent has a default model", () => {
    expect(parseModels(undefined)).toEqual({ scout: null, strategist: null, risk: null, manager: null });
  });
});

describe("config", () => {
  it("guardrail defaults are the PRD's", () => {
    expect(parseGuardrails({})).toEqual({
      maxPositionPct: 25,
      maxActivePositions: 3,
      maxDailyLossPct: 5,
      solReserve: 0.1,
      cooldownSec: 300,
      maxConsecutiveFailures: 3,
      approvalTtlSec: 900,
      dailyLlmUsd: 1,
    });
  });

  it("an open proposal's range must hold the active bin", () => {
    const base = { strategy: "Spot", lowerBin: -10, upperBin: 10, amountSol: 0.25, solUsd: 185 };
    expect(parseProposalParams("open", { ...base, activeBin: 0 }).amountSol).toBe(0.25);
    expect(() => parseProposalParams("open", { ...base, activeBin: 11 })).toThrow();
    expect(() => parseProposalParams("open", { ...base, activeBin: 0, amountSol: 0 })).toThrow();
  });

  it("days start at UTC midnight", () => {
    expect(utcDayStart(Date.UTC(2026, 10, 15, 23, 59)).toISOString()).toBe("2026-11-15T00:00:00.000Z");
  });
});
