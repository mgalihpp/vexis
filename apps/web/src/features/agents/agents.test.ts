import { describe, expect, test } from "bun:test";
import {
  agentFromDraft,
  binLadder,
  countByFilter,
  defaultDraft,
  draftIssues,
  draftRange,
  guardrailRisk,
  pnlSeries,
  positionEstimate,
  SEED_AGENTS,
  summarizeFleet,
  uniqueId,
  visibleAgents,
} from "./agents";

describe("fleet", () => {
  test("summarizes value, fees, pnl and health", () => {
    const s = summarizeFleet(SEED_AGENTS);
    expect(s.total).toBe(5);
    expect(s.live).toBe(3);
    expect(s.attention).toBe(1);
    expect(s.inRange).toBe(3);
    expect(s.best?.name).toBe("Tiang");
    expect(s.valueUsd).toBeCloseTo(48_211.64, 2);
  });

  test("an empty fleet has no best agent and zero pct", () => {
    const s = summarizeFleet([]);
    expect(s.best).toBeNull();
    expect(s.pnl30dPct).toBe(0);
  });

  test("filters by status, searches by name or pair and sorts descending", () => {
    expect(countByFilter(SEED_AGENTS)).toEqual({ all: 5, running: 3, paused: 1, attention: 1 });
    const running = visibleAgents(SEED_AGENTS, { filter: "running", query: "", sort: "value" });
    expect(running.map((a) => a.name)).toEqual(["Tiang", "Meridian", "Nightwatch"]);
    expect(visibleAgents(SEED_AGENTS, { filter: "all", query: "jup", sort: "fees" }).map((a) => a.name)).toEqual([
      "Nightwatch",
    ]);
    expect(visibleAgents(SEED_AGENTS, { filter: "all", query: "", sort: "pnl" }).at(-1)?.name).toBe("Nightwatch");
  });

  test("the bin ladder puts Y below the active bin and X above, with no tick out of range", () => {
    const inside = binLadder({ lower: 182, upper: 196, active: 189 });
    expect(inside.bars).toHaveLength(15);
    expect(inside.bars.indexOf("active")).toBe(7);
    expect(inside.bars.slice(0, 7).every((b) => b === "y")).toBe(true);
    expect(inside.bars.slice(8).every((b) => b === "x")).toBe(true);
    expect(inside.tick).toBeCloseTo(50, 5);
    const out = binLadder({ lower: 172, upper: 182, active: 161 });
    expect(out.tick).toBeNull();
    expect(out.bars.every((b) => b === "x")).toBe(true);
    expect(binLadder({ lower: 0.00812, upper: 0.00868, active: 0.00855 }).bars).toHaveLength(24);
  });
});

describe("wizard draft", () => {
  test("range is centred on the active bin and priced by bin step", () => {
    const r = draftRange(defaultDraft());
    expect(r).toMatchObject({ lower: 182, upper: 196, bins: 14 });
    expect(r.widthPct).toBeCloseTo(0.56, 5);
  });

  test("the deposit splits across the two tokens and sums back", () => {
    const d = defaultDraft();
    const e = positionEstimate(d);
    expect(e.solUsd + e.usdc).toBeCloseTo(d.depositUsd, 6);
    expect(e.solShare).toBeCloseTo(0.5, 5);
  });

  test("risk follows the stop-loss", () => {
    const d = defaultDraft();
    expect(guardrailRisk(d)).toBe("Balanced");
    expect(guardrailRisk({ ...d, stopLoss: { on: true, pct: 8 } })).toBe("Conservative");
    expect(guardrailRisk({ ...d, stopLoss: { on: true, pct: 30 } })).toBe("Aggressive");
    expect(guardrailRisk({ ...d, stopLoss: { on: false, pct: 18 } })).toBe("Aggressive");
  });

  test("reports what blocks launch", () => {
    expect(draftIssues(defaultDraft())).toEqual([]);
    expect(draftIssues({ ...defaultDraft(), name: " ", depositUsd: 0 })).toEqual([
      "Name your agent",
      "Enter a deposit",
    ]);
    expect(draftIssues({ ...defaultDraft(), depositUsd: 1_000_000 })).toEqual([
      "Deposit is larger than the wallet balance",
    ]);
  });

  test("observation mode launches paused, live mode launches live", () => {
    expect(agentFromDraft(defaultDraft(), "x").status).toBe("paused");
    expect(agentFromDraft({ ...defaultDraft(), observation: false }, "x").status).toBe("live");
  });

  test("ids stay unique within the fleet", () => {
    expect(uniqueId("Tiang Two!", [])).toBe("tiang-two");
    expect(uniqueId("Tiang", ["tiang", "tiang-2"])).toBe("tiang-3");
    expect(uniqueId("!!!", [])).toBe("agent");
  });
});

describe("pnlSeries", () => {
  test("is deterministic and ends at the scaled pnl", () => {
    const a = SEED_AGENTS[0];
    if (!a) throw new Error("seed missing");
    expect(pnlSeries(a, 30)).toEqual(pnlSeries(a, 30));
    expect(pnlSeries(a, 30).at(-1)).toBe(a.pnl30dUsd);
    expect(pnlSeries(a, 7)).toHaveLength(8);
  });
});
