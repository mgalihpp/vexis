import { describe, expect, test } from "bun:test";
import { DAILY_LOSS, KILL_SWITCH, PROPOSAL_PARAMS, RiskNotes } from "@vexis/shared/office";
import { SCREENER_PRESETS } from "@vexis/shared/screen";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { pollInbox } from "../src/inbox.ts";
import { callbackData } from "../src/telegram.ts";
import { tick } from "../src/tick.ts";
import {
  BOT_TOKEN,
  CHAT,
  journal,
  MINUTE,
  office,
  openParams,
  POOL,
  PROPOSAL_ID,
  proposal,
  SETUP,
  setup,
  T0,
} from "./fakes.ts";

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
      ["strategist", "strategist-v3", 0.0002],
      ["risk", "risk-v1", 0.0002],
      ["manager", "manager-v1", 0.0002],
    ]);
    expect(s.chain.calls).toEqual([`https://rpc.test/?api-key=secret-key ${POOL}`]);
    expect(s.llm.calls.every((c) => !c.user.includes("secret-key") && !c.user.includes("OWNER1"))).toBe(true);
    // Each desk's thread is the exchange just sent, answer included.
    expect([...s.db.threads.values()].map((t) => [t.agent, t.reply !== null])).toEqual([
      ["scout", true],
      ["strategist", true],
      ["risk", true],
      ["manager", true],
    ]);
    const [scoutCall] = s.llm.calls;
    const scoutThread = s.db.threads.get("user-1:scout");
    expect([scoutThread?.system, scoutThread?.userMessage]).toEqual([scoutCall?.system, scoutCall?.user]);
  });

  test("the Strategist's amount is trimmed to fit the setup quoted on chain for its range", async () => {
    const s = setup();
    s.chain.balanceSol = 1;
    // Two missing bin arrays at 0.0714 each, on top of the 0.0574 position rent.
    s.chain.setup = { ...SETUP, binArrays: 2, binArraySol: 0.1428, totalSol: 0.2002 };
    await s.run(tick());
    expect(s.chain.setupCalls).toEqual([`${POOL} OWNER1 90..110`]);
    // (1 - 0.1 reserve - 0.2002 setup - 0.03 fees - 2 x 0.0874 other slots) / 3 = 0.165.
    const params = PROPOSAL_PARAMS.open.parse(s.db.proposals[0]?.params);
    expect([params.amountSol, params.setupSol]).toEqual([0.164999999, 0.2002]);
    expect(s.db.messages.map((m) => m.text)).toContain(
      "JUP-SOL: The range needs 2 new bin array(s), 0.1428 SOL that is not refunded. Trimmed 1 to 0.1650 SOL to fit the setup cost.",
    );
  });

  test("an open whose setup cannot be quoted on chain is never drafted", async () => {
    const s = setup();
    s.chain.setup = null;
    await s.run(tick());
    expect(s.db.proposals).toEqual([]);
  });

  test("a code veto rejects the draft without asking the Risk agent", async () => {
    const s = setup({ proposals: [proposal({ params: { ...openParams, amountSol: 5 } })] });
    s.llm.replies = {};
    await s.run(tick());
    expect(s.db.proposals[0]).toMatchObject({ status: "rejected", decidedBy: "risk" });
    const notes = RiskNotes.parse(s.db.proposals[0]?.riskNotes);
    expect(notes.checks.filter((c) => !c.ok).map((c) => c.rule)).toEqual(["position_size"]);
    expect(s.llm.calls.filter((c) => c.agent === "risk")).toHaveLength(0);
    // A call that failed still keeps its thread: the two messages, the error, and no answer.
    const scout = s.db.threads.get("user-1:scout");
    expect([scout?.reply, scout?.error]).toEqual([null, "claude/claude-haiku-5-5: HTTP 500"]);
  });

  test("the Risk agent can add a veto", async () => {
    const s = setup({ offices: [office({ models: { risk: { provider: "claude", model: "claude-haiku-5-5" } } })] });
    s.db.proposals.push(proposal());
    s.llm.replies = { risk: JSON.stringify({ veto: true, note: "Range is too narrow for this pool." }) };
    await s.run(tick());
    expect(s.db.proposals[0]).toMatchObject({ status: "rejected", decidedBy: "risk" });
    expect(RiskNotes.parse(s.db.proposals[0]?.riskNotes).llm?.veto).toBe(true);
  });

  test("the office runtime never executes: an approved proposal waits for the runner", async () => {
    const s = setup({ offices: [office({ models: {} })], proposals: [proposal({ status: "approved" })] });
    await s.run(tick());
    expect(statuses(s)).toEqual(["approved"]);
    expect(s.db.journal).toEqual([]);
  });

  test("a Monitor close is checked in code, never by an LLM, and reaches the owner", async () => {
    const s = setup({
      proposals: [
        proposal({ kind: "close", proposedBy: "monitor", positionAddress: "POS1", params: { reason: "stop_loss" } }),
      ],
    });
    s.db.journal.push(journal({ positionAddress: "POS1", valueSol: 0.9, valuedAt: new Date(T0) }));
    await s.run(tick());
    expect(s.db.proposals[0]).toMatchObject({ status: "awaiting_approval" });
    expect(s.db.proposals[0]?.summary).toContain("Close the position");
    expect(s.llm.calls.filter((c) => c.agent === "risk" || c.agent === "manager")).toHaveLength(0);
  });

  test("a Monitor proposal for a position the office did not open is vetoed", async () => {
    const s = setup({
      proposals: [
        proposal({ kind: "claim", proposedBy: "monitor", positionAddress: "ELSEWHERE", params: { feeSol: 1 } }),
      ],
    });
    await s.run(tick());
    expect(s.db.proposals[0]).toMatchObject({ status: "rejected", decidedBy: "risk" });
    expect(RiskNotes.parse(s.db.proposals[0]?.riskNotes).checks.find((c) => !c.ok)?.rule).toBe("office_position");
  });

  test("a proposal past its approval window expires", async () => {
    const s = setup({
      offices: [office({ keySource: "own", models: {} })],
      proposals: [proposal({ status: "awaiting_approval", expiresAt: new Date(T0 - 1) })],
    });
    await s.run(tick());
    expect(statuses(s)).toEqual(["expired"]);
    expect(s.db.messages.map((m) => m.text)).toContain("JUP-SOL expired before anyone approved it.");
  });

  test("under own keys an agent with no model never runs", async () => {
    const s = setup({ offices: [office({ keySource: "own", models: {} })], proposals: [proposal()] });
    await s.run(tick());
    expect(s.llm.calls).toHaveLength(0);
    expect(s.db.runs).toHaveLength(0);
    expect(s.meteora.calls).toBe(1);
    // The code checks still run; with no Manager the proposal waits, then expires.
    expect(statuses(s)).toEqual(["risk_checked"]);
  });

  test("a missing key posts one message a day and makes no call", async () => {
    const s = setup({
      offices: [office({ keySource: "own", models: { scout: { provider: "openai", model: "gpt-6-luna" } } })],
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

  test("the Scout screens with the office's preset, or a custom filter", async () => {
    const midCap = setup({ offices: [office({ poolPreset: "mid-cap" })] });
    await midCap.run(tick());
    expect(midCap.llm.calls.filter((c) => c.agent === "scout")).toHaveLength(0);
    expect(midCap.db.messages.map((m) => m.text)).toContain("No pool passes the screen right now.");

    const filter = {
      ...SCREENER_PRESETS["mid-cap"].filter,
      minMcap: 0,
      maxMcap: 0,
      minStep: 0,
      maxStep: 20,
      minOrganic: 0,
    };
    const custom = setup({ offices: [office({ poolPreset: "mid-cap", poolFilter: filter })] });
    await custom.run(tick());
    expect(custom.llm.calls.filter((c) => c.agent === "scout")).toHaveLength(0);
    const picked = setup({ offices: [office({ poolPreset: "custom", poolFilter: filter })] });
    await picked.run(tick());
    expect(picked.llm.calls.filter((c) => c.agent === "scout")).toHaveLength(1);
  });

  test("custom with no filter never scouts or falls back, and says so once a day", async () => {
    const s = setup({ offices: [office({ poolPreset: "custom", poolFilter: null })] });
    await s.run(
      Effect.gen(function* () {
        yield* tick();
        yield* TestClock.adjust(16 * MINUTE);
        yield* tick();
      }),
    );
    expect(s.meteora.calls).toBe(0);
    expect(s.llm.calls).toHaveLength(0);
    expect(s.db.messages.filter((m) => m.text.startsWith("The custom pool filter is empty"))).toHaveLength(1);
  });

  test("the office's own loss pauses it until the next UTC midnight, a shared wallet's spending does not", async () => {
    const s = setup({ offices: [office({ models: {} })] });
    await s.run(
      Effect.gen(function* () {
        yield* tick();
        s.chain.balanceSol = 5;
        yield* TestClock.adjust(MINUTE);
        yield* tick();
      }),
    );
    expect(s.db.offices[0]?.paused).toBe(false);
    s.db.journal.push(journal({ closedAt: new Date(T0), pnlSol: -0.6 }));
    await s.run(tick(), T0 + 2 * MINUTE);
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

describe("autopilot", () => {
  const autopilot = (autopilotMaxSol: number) => office({ mode: "autopilot", guardrails: { autopilotMaxSol } });
  const linked = (s: ReturnType<typeof setup>) =>
    s.db.bots.set("user-1", { _tag: "ready", token: BOT_TOKEN, chatId: CHAT });

  test("an open at the limit (deposit plus setup) is approved by autopilot, with a notice and no buttons", async () => {
    const s = setup({ offices: [autopilot(openParams.amountSol + SETUP.totalSol)] });
    linked(s);
    await s.run(tick());
    expect(s.db.proposals[0]).toMatchObject({ status: "approved", decidedBy: "autopilot" });
    expect(s.db.messages.at(-1)?.text).toBe(
      "Autopilot approved the open of JUP-SOL: 1.0574 SOL ($158.61), within the 1.0574 SOL limit.",
    );
    const [notice] = s.telegram.sent;
    expect(notice?.buttons).toEqual([]);
    expect(notice?.text).toContain("✅ Approved by autopilot. It moves 1.0574 SOL ($158.61)");
    expect(notice?.text).not.toContain("Expires");
    expect(s.db.proposals[0]?.telegramMessageId).toBe(notice?.messageId ?? -1);
  });

  test("over the limit, or in approval mode, the owner still decides on a card", async () => {
    const over = setup({ offices: [autopilot(1)] });
    linked(over);
    await over.run(tick());
    expect(over.db.proposals[0]).toMatchObject({ status: "awaiting_approval", decidedBy: null });
    expect(over.db.messages.at(-1)?.text).toContain("1.0574 SOL is over the 1 SOL limit");
    expect(over.telegram.sent[0]?.buttons.map((b) => b.text)).toEqual(["Approve", "Reject"]);

    const asking = setup({ offices: [office({ guardrails: { autopilotMaxSol: 100 } })] });
    await asking.run(tick());
    expect(asking.db.proposals[0]).toMatchObject({ status: "awaiting_approval", decidedBy: null });
  });

  test("a close weighs the position it closes at cost", async () => {
    const close = () =>
      proposal({ kind: "close", proposedBy: "monitor", positionAddress: "POS1", params: { reason: "stop_loss" } });
    const within = setup({ offices: [autopilot(1)], proposals: [close()] });
    within.db.journal.push(journal({ positionAddress: "POS1", amountSol: 1 }));
    await within.run(tick());
    expect(within.db.proposals[0]).toMatchObject({ status: "approved", decidedBy: "autopilot" });

    const over = setup({ offices: [autopilot(1)], proposals: [close()] });
    over.db.journal.push(journal({ positionAddress: "POS1", amountSol: 2 }));
    await over.run(tick());
    expect(over.db.proposals[0]).toMatchObject({ status: "awaiting_approval", decidedBy: null });
  });

  test("autopilot approves nothing while the office is paused", async () => {
    const s = setup({
      offices: [
        office({ mode: "autopilot", guardrails: { autopilotMaxSol: 100 }, paused: true, pausedReason: KILL_SWITCH }),
      ],
      proposals: [proposal({ status: "risk_checked" })],
    });
    await s.run(tick());
    expect(statuses(s)).toEqual(["risk_checked"]);
  });
});

describe("daily briefing", () => {
  const NEXT_DAY = Date.UTC(2026, 0, 2);
  const briefing = JSON.stringify({ headline: "A quiet day.", body: "One open was approved. Nothing closed." });
  const briefed = () => {
    const s = setup({ offices: [office({ createdAt: new Date(T0 - 86_400_000) })] });
    s.llm.replies = { manager: briefing };
    s.db.bots.set("user-1", { _tag: "ready", token: BOT_TOKEN, chatId: CHAT });
    return s;
  };

  test("yesterday is briefed once, after 00:30 UTC, stored, posted to the feed and sent to the bot", async () => {
    const s = briefed();
    await s.run(tick(), NEXT_DAY + 29 * MINUTE);
    expect(s.db.briefings).toHaveLength(0);

    await s.run(tick(), NEXT_DAY + 45 * MINUTE);
    await s.run(tick(), NEXT_DAY + 46 * MINUTE);
    expect(s.db.briefings.map((b) => [b.day, b.headline])).toEqual([["2026-01-01", "A quiet day."]]);
    expect(s.db.runs.filter((r) => r.promptVersion === "briefing-v1")).toHaveLength(1);
    expect(s.db.messages.some((m) => m.text === "Briefing for 2026-01-01: A quiet day.")).toBe(true);
    const sent = s.telegram.sent.find((m) => m.text.startsWith("Daily briefing, 2026-01-01 (UTC)"));
    expect(sent?.text).toContain("Realized PnL: no closes");
    expect(sent?.buttons).toEqual([]);
  });

  test("a failing briefing never keeps the desks from their tick", async () => {
    const s = setup({ offices: [office({ createdAt: new Date(T0 - 86_400_000) })] });
    s.db.briefingsDown = true;
    await s.run(tick(), NEXT_DAY + 45 * MINUTE);
    expect(statuses(s)).toEqual(["awaiting_approval"]);
  });

  test("a reply in the wrong shape is retried an hour later, not every minute", async () => {
    const s = briefed();
    s.llm.replies = { manager: "not json" };
    await s.run(tick(), NEXT_DAY + 45 * MINUTE);
    await s.run(tick(), NEXT_DAY + 46 * MINUTE);
    expect(s.llm.calls.filter((c) => c.system.includes("briefing"))).toHaveLength(1);
    expect(s.db.briefings).toHaveLength(0);
  });
});

describe("office on Telegram", () => {
  const linked = (s: ReturnType<typeof setup>) =>
    s.db.bots.set("user-1", { _tag: "ready", token: BOT_TOKEN, chatId: CHAT });
  const waiting = (overrides: Parameters<typeof proposal>[0] = {}) =>
    proposal({ id: PROPOSAL_ID, status: "awaiting_approval", telegramMessageId: 100, ...overrides });
  const press = (decision: "approve" | "reject", chat = CHAT, id = 7) => ({
    update_id: id,
    callback_query: {
      id: `cb-${id}`,
      data: callbackData(decision, PROPOSAL_ID),
      message: { message_id: 100, chat: { id: chat } },
    },
  });
  const say = (text: string, id = 8) => ({ update_id: id, message: { chat: { id: CHAT }, text } });

  test("a proposal that reaches the owner gets one card with Approve and Reject, and keeps its message id", async () => {
    const s = setup();
    linked(s);
    await s.run(tick());
    const [card] = s.telegram.sent;
    expect(card?.chatId).toBe(CHAT);
    expect(card?.text).toContain("Proposal: open JUP-SOL");
    expect(card?.buttons.map((b) => b.text)).toEqual(["Approve", "Reject"]);
    expect(s.db.proposals[0]).toMatchObject({ status: "awaiting_approval", telegramMessageId: card?.messageId });
  });

  test("no linked bot means no card and no pause; a failed send leaves the proposal approvable and tells the feed", async () => {
    const none = setup();
    await none.run(tick());
    expect(none.telegram.sent).toHaveLength(0);
    expect(none.db.offices[0]?.paused).toBe(false);

    const failing = setup();
    linked(failing);
    failing.telegram.failing = true;
    await failing.run(tick());
    expect(failing.db.proposals[0]).toMatchObject({ status: "awaiting_approval", telegramMessageId: null });
    expect(failing.db.messages.at(-1)?.text).toContain("The Telegram card was not delivered");
  });

  test("Approve decides through the shared path, answers the press and edits the card", async () => {
    const s = setup({ proposals: [waiting()] });
    linked(s);
    s.telegram.inbox = [press("approve")];
    await s.run(pollInbox());
    expect(s.db.proposals[0]).toMatchObject({ status: "approved", decidedBy: "owner", telegramMessageId: null });
    expect(s.telegram.answers).toEqual([{ callbackId: "cb-7", text: "Approved" }]);
    expect(s.telegram.edits).toHaveLength(1);
    expect(s.telegram.edits[0]?.text.endsWith("✅ Approved.")).toBe(true);
    expect(s.db.bots.get("user-1")).toMatchObject({ offset: 8 });
  });

  test.each([
    ["an expired proposal", { proposals: [waiting({ expiresAt: new Date(T0 - 1) })] }, "This proposal expired"],
    [
      "a paused office",
      { offices: [office({ paused: true, pausedReason: KILL_SWITCH })], proposals: [waiting()] },
      "The office is paused; nothing can be approved",
    ],
    [
      "an already decided proposal",
      { proposals: [waiting({ status: "rejected" })] },
      "This proposal was already decided",
    ],
  ])("Approve on %s is refused and said so", async (_, seed, text) => {
    const s = setup(seed);
    linked(s);
    s.telegram.inbox = [press("approve")];
    await s.run(pollInbox());
    expect(s.db.proposals[0]?.status).not.toBe("approved");
    expect(s.telegram.answers).toEqual([{ callbackId: "cb-7", text }]);
  });

  test("a press from another chat is answered and ignored", async () => {
    const s = setup({ proposals: [waiting()] });
    linked(s);
    s.telegram.inbox = [press("approve", 999)];
    await s.run(pollInbox());
    expect(s.db.proposals[0]?.status).toBe("awaiting_approval");
    expect(s.telegram.answers).toEqual([{ callbackId: "cb-7", text: "" }]);
    expect(s.telegram.edits).toHaveLength(0);
  });

  test("/stop is the kill switch and /resume lifts it; the killed card shows it", async () => {
    const s = setup({ proposals: [waiting()] });
    linked(s);
    s.telegram.inbox = [say("/stop")];
    await s.run(pollInbox());
    expect(s.db.offices[0]).toMatchObject({ paused: true, pausedReason: KILL_SWITCH });
    expect(s.db.proposals[0]).toMatchObject({ status: "rejected", decidedBy: "kill_switch" });
    expect(s.telegram.sent.at(-1)?.text).toContain("Office stopped. 1 proposal(s) rejected.");
    expect(s.telegram.edits[0]?.text.endsWith("🛑 Rejected by the kill switch.")).toBe(true);

    s.telegram.inbox = [say("/resume", 9)];
    await s.run(pollInbox());
    expect(s.db.offices[0]?.paused).toBe(false);
    expect(s.telegram.sent.at(-1)?.text).toBe("The office is running again.");
    expect(s.telegram.polls).toEqual([null, 9]);
  });

  test("a card decided on the web or expired is edited at the next poll", async () => {
    const s = setup({ offices: [office({ models: {} })], proposals: [waiting({ expiresAt: new Date(T0 - 1) })] });
    linked(s);
    await s.run(
      Effect.gen(function* () {
        yield* tick();
        yield* pollInbox();
        yield* pollInbox();
      }),
    );
    expect(s.telegram.edits.map((e) => e.text.split("\n").at(-1))).toEqual(["⌛ Expired before anyone approved it."]);
  });
});
