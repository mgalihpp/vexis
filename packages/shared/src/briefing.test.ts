import { describe, expect, test } from "bun:test";
import { BRIEFING_ATTEMPTS, BRIEFING_RETRY_MS, briefingDay, briefingDue, briefingStats } from "./briefing.ts";

const DAY = Date.UTC(2026, 10, 18);
const YESTERDAY = new Date(DAY - 86_400_000);
const at = (h: number, m = 0) => DAY + (h * 60 + m) * 60_000;
const longAgo = new Date(Date.UTC(2026, 0, 1));
const none = { count: 0, lastAt: null };

describe("briefing schedule", () => {
  test("yesterday is briefed from 00:30 UTC, never before", () => {
    expect(briefingDay(at(0, 29), longAgo)).toBeNull();
    expect(briefingDay(at(0, 30), longAgo)).toEqual(YESTERDAY);
    expect(briefingDay(at(23, 59), longAgo)).toEqual(YESTERDAY);
  });

  test("an office created today has no yesterday to brief on", () => {
    expect(briefingDay(at(12), new Date(at(0, 1)))).toBeNull();
    expect(briefingDay(at(12), new Date(DAY - 1))).toEqual(YESTERDAY);
  });

  test("once briefed, the day is not briefed again, across restarts", () => {
    expect(briefingDue(YESTERDAY, null, none, at(1))).toBe(true);
    expect(briefingDue(YESTERDAY, "2026-11-17", none, at(1))).toBe(false);
    expect(briefingDue(YESTERDAY, "2026-11-16", none, at(1))).toBe(true);
    expect(briefingDue(null, null, none, at(1))).toBe(false);
  });

  test("failed attempts retry an hour apart and stop after the day's limit", () => {
    const last = new Date(at(1));
    expect(briefingDue(YESTERDAY, null, { count: 1, lastAt: last }, at(1) + BRIEFING_RETRY_MS - 1)).toBe(false);
    expect(briefingDue(YESTERDAY, null, { count: 1, lastAt: last }, at(1) + BRIEFING_RETRY_MS)).toBe(true);
    expect(briefingDue(YESTERDAY, null, { count: BRIEFING_ATTEMPTS, lastAt: last }, at(20))).toBe(false);
  });
});

describe("briefing numbers", () => {
  test("decisions are split by who decided; unknown PnL is left out of the sums and counted", () => {
    const stats = briefingStats({
      day: YESTERDAY,
      proposals: [
        { status: "done", decidedBy: "owner" },
        { status: "failed", decidedBy: "autopilot" },
        { status: "executing", decidedBy: "autopilot" },
        { status: "rejected", decidedBy: "risk" },
        { status: "rejected", decidedBy: "kill_switch" },
        { status: "expired", decidedBy: "system" },
        { status: "awaiting_approval", decidedBy: null },
      ],
      closes: [
        { pnlSol: 0.5, pnlUsd: 30 },
        { pnlSol: -0.25, pnlUsd: null },
        { pnlSol: null, pnlUsd: null },
      ],
      open: [{ amountSol: 1 }, { amountSol: 0.5 }],
      runs: [
        { costUsd: 0.01, error: null },
        { costUsd: null, error: "timeout" },
      ],
      messages: [{ tone: "info" }, { tone: "warn" }, { tone: "bad" }, { tone: null }],
    });
    expect(stats).toEqual({
      day: "2026-11-17",
      proposals: {
        total: 7,
        approvedByOwner: 1,
        approvedByAutopilot: 2,
        vetoed: 1,
        rejected: 1,
        expired: 1,
        done: 1,
        failed: 1,
      },
      closes: { count: 3, pnlSol: 0.25, pnlUsd: 30, unknown: 1 },
      open: { count: 2, sol: 1.5 },
      llm: { usd: 0.01, runs: 2, failed: 1 },
      warnings: 2,
    });
  });

  test("a day with no priced close has no PnL, not a zero", () => {
    const stats = briefingStats({
      day: YESTERDAY,
      proposals: [],
      closes: [{ pnlSol: null, pnlUsd: null }],
      open: [],
      runs: [],
      messages: [],
    });
    expect(stats.closes).toEqual({ count: 1, pnlSol: null, pnlUsd: null, unknown: 1 });
  });
});
