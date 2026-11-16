import { describe, expect, it } from "bun:test";
import {
  AgentModel,
  activeModels,
  canTransition,
  FINAL_STATUSES,
  OfficeScreen,
  officeFilter,
  PROPOSAL_STATUSES,
  parseGuardrails,
  parseModels,
  parseProposalParams,
  parseScreen,
  refuseDecision,
  runCost,
  transition,
  utcDayStart,
  VEXIS_MODELS,
} from "./office.ts";
import { SCREENER_PRESETS } from "./screen.ts";

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

  const NOW = Date.UTC(2026, 10, 16, 12);
  const running = { paused: false, pausedReason: null, pausedUntil: null };
  const waiting = { status: "awaiting_approval" as const, expiresAt: new Date(NOW + 60_000) };
  it.each([
    ["approve", running, waiting, null],
    ["reject", running, waiting, null],
    ["approve", undefined, waiting, "no_office"],
    ["approve", running, undefined, "not_found"],
    ["approve", running, { ...waiting, status: "approved" as const }, "decided"],
    ["reject", running, { ...waiting, status: "expired" as const }, "decided"],
    ["approve", running, { ...waiting, expiresAt: new Date(NOW) }, "expired"],
    ["reject", running, { ...waiting, expiresAt: new Date(NOW) }, null],
    ["approve", { paused: true, pausedReason: "kill_switch", pausedUntil: null }, waiting, "paused"],
    ["approve", { paused: true, pausedReason: "daily_loss", pausedUntil: NOW - 1 }, waiting, null],
  ] as const)("the owner may %s (office %o, proposal %o): %s", (decision, office, proposal, refusal) => {
    expect(refuseDecision(office, proposal, decision, NOW)).toBe(refusal);
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
    expect(runCost("openrouter", "deepseek/deepseek-v4.1-flash", 1_000_000, 1_000_000)).toBeCloseTo(0.56);
  });

  it("an unlisted model has no cost and cannot be picked", () => {
    expect(runCost("openai", "gpt-unknown", 10, 10)).toBeNull();
    expect(AgentModel.safeParse({ provider: "openai", model: "gpt-unknown" }).success).toBe(false);
    expect(AgentModel.safeParse({ provider: "openai", model: "gpt-6-luna" }).success).toBe(true);
  });

  it("under own keys no agent has a default model; under the Vexis key Vexis picks them all", () => {
    const none = parseModels(undefined);
    expect(none).toEqual({ scout: null, strategist: null, risk: null, manager: null });
    expect(activeModels("own", none)).toEqual(none);
    expect(activeModels("vexis", none)).toEqual(VEXIS_MODELS);
    for (const m of Object.values(VEXIS_MODELS)) expect(AgentModel.safeParse(m).success).toBe(true);
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

  it("the pool screen stores a preset id or a custom filter, and custom never falls back to a preset", () => {
    const custom = { ...SCREENER_PRESETS.degen.filter, minTvl: 50_000 };
    expect(parseScreen({ poolPreset: null, poolFilter: null })).toEqual({ preset: "blue-chip", custom: null });
    expect(officeFilter(parseScreen({ poolPreset: "mid-cap", poolFilter: custom }))).toBe(
      SCREENER_PRESETS["mid-cap"].filter,
    );
    expect(officeFilter(parseScreen({ poolPreset: "custom", poolFilter: custom }))).toEqual(custom);
    expect(officeFilter(parseScreen({ poolPreset: "custom", poolFilter: null }))).toBeNull();
    expect(OfficeScreen.safeParse({ preset: "whale" }).success).toBe(false);
    expect(() => parseScreen({ poolPreset: "custom", poolFilter: { minTvl: -1 } })).toThrow();
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
