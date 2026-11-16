import { describe, expect, test } from "bun:test";
import {
  callbackData,
  cardButtons,
  cardText,
  outcome,
  parseCallback,
  parseCommand,
  readUpdate,
  settledText,
} from "../src/telegram.ts";
import { CHAT, POOL, PROPOSAL_ID, proposal, T0 } from "./fakes.ts";

const checked = proposal({
  id: PROPOSAL_ID,
  status: "awaiting_approval",
  summary: "1 SOL Spot in JUP-SOL for its fees.",
  riskNotes: {
    checks: [
      { rule: "max_position_pct", ok: true, value: "1.000 SOL of max 2.500 SOL (25%)" },
      { rule: "cooldown", ok: true, value: "no execution yet" },
    ],
    llm: { veto: false, note: "Range suits the bin step." },
  },
});

describe("approval card", () => {
  test("carries pool, action, range, amount in SOL and USD, summary, guardrails and expiry", () => {
    expect(cardText(checked)).toBe(
      [
        "Proposal: open JUP-SOL",
        `Pool ${POOL}`,
        "Range: bins 90 to 110 (active 100), Spot",
        "Amount: 1 SOL / $150.00",
        "",
        "1 SOL Spot in JUP-SOL for its fees.",
        "",
        "Guardrails:",
        "✅ max_position_pct: 1.000 SOL of max 2.500 SOL (25%)",
        "✅ cooldown: no execution yet",
        "Risk Manager: Range suits the bin step.",
        "",
        "Expires 12:15 UTC",
      ].join("\n"),
    );
    expect(cardButtons(PROPOSAL_ID).map((b) => [b.text, b.callback_data])).toEqual([
      ["Approve", `approve:${PROPOSAL_ID}`],
      ["Reject", `reject:${PROPOSAL_ID}`],
    ]);
  });

  test("an unknown SOL price shows a dash, never a zero", () => {
    const p = proposal({ params: { ...checked.params, solUsd: null } });
    expect(cardText(p)).toContain("Amount: 1 SOL / —");
  });

  test.each([
    ["awaiting_approval", null, {}, null],
    ["approved", "owner", {}, "✅ Approved."],
    ["done", "owner", {}, "✅ Approved. Preview: simulated, nothing was signed."],
    ["done", "owner", { simulated: false, signature: "SIG1" }, "✅ Done: https://solscan.io/tx/SIG1"],
    ["failed", "owner", { simulated: false, txError: "slippage" }, "⚠️ Failed: slippage"],
    ["rejected", "owner", {}, "❌ Rejected."],
    ["rejected", "risk", {}, "❌ Stopped by the guardrails."],
    ["rejected", "kill_switch", {}, "🛑 Rejected by the kill switch."],
    ["expired", "system", {}, "⌛ Expired before anyone approved it."],
  ] as const)("a %s card decided by %s ends with %#", (status, decidedBy, tx, line) => {
    expect(outcome({ status, decidedBy, simulated: true, signature: null, txError: null, ...tx })).toBe(line);
  });

  test("a Monitor card names the position and what it will do", () => {
    const close = proposal({ kind: "close", positionAddress: "POS1", params: { reason: "stop_loss" } });
    expect(cardText(close)).toContain("Position POS1");
    expect(cardText(close)).toContain("Reason: stop loss");
  });

  test("the settled card keeps the details and adds the outcome", () => {
    const text = settledText({ ...checked, status: "rejected", decidedBy: "kill_switch" });
    expect(text.startsWith(cardText(checked))).toBe(true);
    expect(text.endsWith("🛑 Rejected by the kill switch.")).toBe(true);
  });
});

describe("what comes back", () => {
  test.each([
    [callbackData("approve", PROPOSAL_ID), { decision: "approve", proposalId: PROPOSAL_ID }],
    [callbackData("reject", PROPOSAL_ID), { decision: "reject", proposalId: PROPOSAL_ID }],
    [`approve:${PROPOSAL_ID}x`, null],
    ["approve:proposal-1", null],
    [`close:${PROPOSAL_ID}`, null],
    [undefined, null],
  ] as const)("callback %p parses to %o", (data, parsed) => {
    expect(parseCallback(data)).toEqual(parsed);
  });

  test.each([
    ["/stop", "stop"],
    ["/stop@vexis_office_bot", "stop"],
    [" /Resume ", "resume"],
    ["/start", "help"],
    ["stop", null],
    [undefined, null],
  ] as const)("message %p is the command %p", (text, command) => {
    expect(parseCommand(text)).toBe(command);
  });

  const press = (chat: number, data = callbackData("approve", PROPOSAL_ID)) => ({
    update_id: 1,
    callback_query: { id: "cb-1", data, message: { message_id: 100, chat: { id: chat } } },
  });

  test("only the linked chat decides or commands; another chat's press is only answered", () => {
    expect(readUpdate(press(CHAT), CHAT)).toEqual({
      _tag: "decide",
      callbackId: "cb-1",
      decision: "approve",
      proposalId: PROPOSAL_ID,
    });
    expect(readUpdate(press(999), CHAT)).toEqual({ _tag: "dismiss", callbackId: "cb-1" });
    expect(readUpdate(press(CHAT, "junk"), CHAT)).toEqual({ _tag: "dismiss", callbackId: "cb-1" });
    expect(readUpdate({ update_id: 2, message: { chat: { id: CHAT }, text: "/stop" } }, CHAT)).toEqual({
      _tag: "command",
      command: "stop",
    });
    expect(readUpdate({ update_id: 3, message: { chat: { id: 999 }, text: "/stop" } }, CHAT)).toEqual({
      _tag: "ignore",
    });
    expect(readUpdate({ update_id: 4, message: { chat: { id: CHAT }, text: "hi" } }, CHAT)).toEqual({
      _tag: "ignore",
    });
  });

  test("the expiry is printed in UTC", () => {
    expect(cardText(proposal({ expiresAt: new Date(T0 + 90 * 60_000) }))).toContain("Expires 13:30 UTC");
  });
});
