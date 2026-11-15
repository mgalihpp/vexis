import { describe, expect, test } from "bun:test";
import { DAILY_LOSS, RiskNotes } from "@vexis/db/office";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { tick } from "../src/tick.ts";
import { MINUTE, office, openParams, POOL, proposal, setup, T0 } from "./fakes.ts";

const statuses = (s: ReturnType<typeof setup>) => s.db.proposals.map((p) => p.status);

describe("office tick", () => {
  test("a draft goes through Risk and the Manager to the owner", async () => {
    const s = setup();
    await s.run(tick());
    const [p] = s.db.proposals;
    expect(p).toMatchObject({ status: "awaiting_approval", kind: "open", poolAddress: POOL, decidedBy: null });
    expect(p?.params).toEqual(openParams);
    expect(p?.summary).toContain("JUP-SOL");
    expect(p?.expiresAt.getTime()).toBe(T0 + 900_000);
    const notes = RiskNotes.parse(p?.riskNotes);
    expect(notes.checks.every((c) => c.ok)).toBe(true);
    expect(notes.llm).toEqual({ veto: false, note: "Range suits the bin step." });
    expect(s.db.runs.map((r) => [r.agent, r.promptVersion, r.costUsd])).toEqual([
      ["scout", "scout-v1", 0.0002],
      ["strategist", "strategist-v1", 0.0002],
      ["risk", "risk-v1", 0.0002],
      ["manager", "manager-v1", 0.0002],
    ]);
    expect(s.chain.calls).toEqual([`https://rpc.test/?api-key=secret-key ${POOL}`]);
    expect(s.llm.calls.every((c) => !c.user.includes("secret-key") && !c.user.includes("OWNER1"))).toBe(true);
  });

  test("a code veto rejects the draft without asking the Risk agent", async () => {
    const s = setup({ proposals: [proposal({ params: { ...openParams, amountSol: 5 } })] });
    s.llm.replies = {};
    await s.run(tick());
    expect(s.db.proposals[0]).toMatchObject({ status: "rejected", decidedBy: "risk" });
    const notes = RiskNotes.parse(s.db.proposals[0]?.riskNotes);
    expect(notes.checks.filter((c) => !c.ok).map((c) => c.rule)).toEqual(["max_position_pct"]);
    expect(s.llm.calls.filter((c) => c.agent === "risk")).toHaveLength(0);
  });

  test("the Risk agent can add a veto", async () => {
    const s = setup({ offices: [office({ models: { risk: { provider: "claude", model: "claude-haiku-5-5" } } })] });
    s.db.proposals.push(proposal());
    s.llm.replies = { risk: JSON.stringify({ veto: true, note: "Range is too narrow for this pool." }) };
    await s.run(tick());
    expect(s.db.proposals[0]).toMatchObject({ status: "rejected", decidedBy: "risk" });
    expect(RiskNotes.parse(s.db.proposals[0]?.riskNotes).llm?.veto).toBe(true);
  });

  test("an approved open is simulated: done, no signature, a simulated journal row", async () => {
    const s = setup({ offices: [office({ models: {} })], proposals: [proposal({ status: "approved" })] });
    await s.run(tick());
    expect(s.db.proposals[0]).toMatchObject({ status: "done", signature: null });
    expect(s.db.journal).toMatchObject([
      { simulated: true, amountSol: 1, amountUsd: 150, openReason: "Deep pool with steady fees.", pnlSol: null },
    ]);
    expect(s.db.messages.find((m) => m.agent === "executor")?.text).toContain("Nothing was signed");
  });

  test("a proposal past its approval window expires", async () => {
    const s = setup({
      offices: [office({ models: {} })],
      proposals: [proposal({ status: "awaiting_approval", expiresAt: new Date(T0 - 1) })],
    });
    await s.run(tick());
    expect(statuses(s)).toEqual(["expired"]);
    expect(s.db.messages.map((m) => m.text)).toContain("JUP-SOL expired before anyone approved it.");
  });

  test("an agent with no model never runs", async () => {
    const s = setup({ offices: [office({ models: {} })], proposals: [proposal()] });
    await s.run(tick());
    expect(s.llm.calls).toHaveLength(0);
    expect(s.db.runs).toHaveLength(0);
    expect(s.meteora.calls).toBe(1);
    // The code checks still run; with no Manager the proposal waits, then expires.
    expect(statuses(s)).toEqual(["risk_checked"]);
  });

  test("a missing key posts one message a day and makes no call", async () => {
    const s = setup({
      offices: [office({ models: { scout: { provider: "openai", model: "gpt-6-luna" } } })],
    });
    await s.run(
      Effect.gen(function* () {
        yield* tick();
        yield* TestClock.adjust(16 * MINUTE);
        yield* tick();
      }),
    );
    expect(s.llm.calls).toHaveLength(0);
    expect(s.meteora.calls).toBe(0);
    expect(s.db.messages.filter((m) => m.text.startsWith("No OpenAI key"))).toHaveLength(1);
  });

  test("one screener request serves every office's Scout in a window", async () => {
    const s = setup({ offices: [office(), office({ userId: "user-2" })] });
    s.db.wallets.set("user-2", { _tag: "ready", owner: "OWNER2", rpcUrl: "https://rpc2.test" });
    await s.run(
      Effect.gen(function* () {
        yield* tick();
        // A volume alert sends user-2's Scout out early, inside the same window.
        s.db.alerts.push({
          userId: "user-2",
          poolAddress: POOL,
          ratio: 4,
          vol1m: 30_000,
          at: new Date(T0 + 4 * MINUTE),
        });
        yield* TestClock.adjust(5 * MINUTE);
        yield* tick();
      }),
    );
    expect(s.meteora.calls).toBe(1);
    expect(s.llm.calls.filter((c) => c.agent === "scout")).toHaveLength(3);
  });

  test("a daily loss over the limit pauses the office until the next UTC midnight", async () => {
    const s = setup({ offices: [office({ models: {} })] });
    await s.run(
      Effect.gen(function* () {
        yield* tick();
        s.chain.balanceSol = 9.4;
        yield* TestClock.adjust(MINUTE);
        yield* tick();
      }),
    );
    expect(s.db.offices[0]).toMatchObject({
      paused: true,
      pausedReason: DAILY_LOSS,
      pausedUntil: new Date(Date.UTC(2026, 0, 2)),
    });
  });

  test("a paused office does nothing until its pause runs out", async () => {
    const until = new Date(T0 + 2 * MINUTE);
    const s = setup({ offices: [office({ paused: true, pausedReason: DAILY_LOSS, pausedUntil: until })] });
    await s.run(tick());
    expect(s.llm.calls).toHaveLength(0);
    await s.run(tick(), T0 + 3 * MINUTE);
    expect(s.db.offices[0]?.paused).toBe(false);
    expect(s.llm.calls.length).toBeGreaterThan(0);
  });
});
