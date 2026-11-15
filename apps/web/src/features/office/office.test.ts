import { describe, expect, test } from "bun:test";
import { ADMIN_STOP, DAILY_LOSS, EXECUTION_FAILING, KILL_SWITCH, parseGuardrails } from "@vexis/db/office";
import {
  BUBBLE_MS,
  bubbles,
  type ConfigView,
  countdown,
  deployed,
  deskStatuses,
  type MessageView,
  missingKeys,
  type OfficeView,
  type PositionView,
  type ProposalView,
  pauseView,
  proposalFacts,
  RECENT_MS,
  spendVsCap,
  waitingProposals,
  walks,
} from "./office";

const NOW = Date.UTC(2026, 10, 15, 12, 0, 0);
const claude = { provider: "claude" as const, model: "claude-haiku-5-5" };

const config = (over: Partial<ConfigView> = {}): ConfigView => ({
  paused: false,
  pausedReason: null,
  pausedUntil: null,
  mode: "approval",
  guardrails: parseGuardrails({}),
  models: { scout: claude, strategist: claude, risk: claude, manager: claude },
  keySource: "vexis",
  vexisDailyUsd: 2,
  savedKeys: [],
  walletSource: "user",
  userWallet: null,
  officeWallet: null,
  ...over,
});

const proposal = (over: Partial<ProposalView> = {}): ProposalView =>
  ({
    id: "p1",
    kind: "open",
    status: "awaiting_approval",
    poolAddress: "Pool1111111111111111111111111111111111111111",
    poolName: "JUP-SOL",
    rationale: "",
    summary: null,
    proposedBy: "strategist",
    decidedBy: null,
    risk: null,
    params: { strategy: "Spot", activeBin: 0, lowerBin: -12, upperBin: 12, amountSol: 0.25, solUsd: 180 },
    expiresAt: NOW + 600_000,
    createdAt: NOW - 300_000,
    updatedAt: NOW - 300_000,
    ...over,
  }) as ProposalView;

const message = (over: Partial<MessageView> = {}): MessageView => ({
  id: "m1",
  agent: "scout",
  text: "hi",
  tone: null,
  poolAddress: null,
  proposalId: null,
  at: NOW - 1000,
  ...over,
});

const view = (over: Partial<OfficeView> = {}): OfficeView => ({
  enabled: true,
  now: NOW,
  config: config(),
  proposals: [],
  messages: [],
  runs: [],
  positions: [],
  pnl: { today: { sol: null, usd: null }, total: { sol: null, usd: null } },
  spend: [],
  today: {},
  ...over,
});

describe("desk status", () => {
  test("first matching rule wins for each desk", () => {
    const s = deskStatuses(
      view({
        config: config({ models: { scout: null, strategist: claude, risk: claude, manager: claude } }),
        proposals: [proposal(), proposal({ id: "p2", status: "executing" })],
        runs: [
          { agent: "strategist", provider: "claude", model: claude.model, error: "429", at: NOW - 5000 },
          { agent: "risk", provider: "claude", model: claude.model, error: null, at: NOW - 5000 },
        ],
        messages: [message({ agent: "monitor", at: NOW - RECENT_MS - 1 })],
      }),
      NOW,
    );
    expect(s).toEqual({
      scout: "off",
      strategist: "error",
      risk: "thinking",
      manager: "waiting",
      monitor: "idle",
      executor: "thinking",
      bookkeeper: "idle",
    });
  });

  test("a newer successful run clears an older error", () => {
    const s = deskStatuses(
      view({
        runs: [
          { agent: "scout", provider: "claude", model: claude.model, error: null, at: NOW - RECENT_MS - 10 },
          { agent: "scout", provider: "claude", model: claude.model, error: "timeout", at: NOW - RECENT_MS - 20 },
        ],
      }),
      NOW,
    );
    expect(s.scout).toBe("idle");
  });

  test("a paused office is error on every desk, until its pause time passes", () => {
    const paused = view({ config: config({ paused: true, pausedReason: DAILY_LOSS, pausedUntil: NOW + 1000 }) });
    expect(Object.values(deskStatuses(paused, NOW))).toEqual(Array(7).fill("error"));
    expect(deskStatuses(paused, NOW + 1000).scout).toBe("idle");
  });
});

describe("pause", () => {
  test.each([
    [KILL_SWITCH, null, true],
    [EXECUTION_FAILING, null, true],
    [DAILY_LOSS, NOW + 60_000, false],
    [ADMIN_STOP, null, false],
    ["something_new", null, false],
  ])("%s until %p: owner may resume %p", (reason, until, canResume) => {
    const p = pauseView({ paused: true, pausedReason: reason, pausedUntil: until }, NOW);
    expect(p.state === "paused" && p.canResume).toBe(canResume);
  });

  test("a pause past its time reads as running", () => {
    expect(pauseView({ paused: true, pausedReason: DAILY_LOSS, pausedUntil: NOW }, NOW)).toEqual({ state: "running" });
  });
});

describe("countdown", () => {
  test("minutes and seconds, hours past an hour, expired at zero", () => {
    expect(countdown({ createdAt: NOW - 1000, expiresAt: NOW + 65_000 }, NOW)).toMatchObject({ text: "1:05" });
    expect(countdown({ createdAt: NOW, expiresAt: NOW + 3_725_000 }, NOW).text).toBe("1:02:05");
    expect(countdown({ createdAt: NOW - 1000, expiresAt: NOW }, NOW)).toEqual({
      expired: true,
      text: "expired",
      share: 0,
    });
    expect(countdown({ createdAt: NOW - 500, expiresAt: NOW + 500 }, NOW).share).toBe(0.5);
  });
});

describe("approval card", () => {
  test("live proposals first, the one expiring first on top; expired ones last", () => {
    const order = waitingProposals(
      [
        proposal({ id: "late", expiresAt: NOW + 900_000 }),
        proposal({ id: "gone", expiresAt: NOW - 1000 }),
        proposal({ id: "soon", expiresAt: NOW + 60_000 }),
        proposal({ id: "done", status: "done" }),
      ],
      NOW,
    ).map((p) => p.id);
    expect(order).toEqual(["soon", "late", "gone"]);
  });

  test("amount in SOL with USD from the proposer's SOL price, else a dash", () => {
    const amount = (solUsd: number | null) =>
      proposalFacts(
        proposal({
          params: { strategy: "Spot", activeBin: 0, lowerBin: -12, upperBin: 12, amountSol: 0.25, solUsd },
        }),
      ).find((f) => f.label === "Amount");
    expect(amount(180)).toEqual({ label: "Amount", value: "0.2500 SOL", sub: "$45.00" });
    expect(amount(null)?.sub).toBe("—");
  });

  test("params that no longer parse show dashes", () => {
    const facts = proposalFacts(proposal({ params: null }));
    expect(facts.find((f) => f.label === "Range (bin)")?.value).toBe("—");
    expect(facts.find((f) => f.label === "Amount")?.value).toBe("—");
  });
});

describe("open positions", () => {
  const row = (amountUsd: number | null): PositionView => ({
    id: "j",
    poolAddress: "a",
    poolName: null,
    simulated: true,
    amountSol: 0.25,
    amountUsd,
    openReason: "",
    openedAt: NOW,
  });

  test("USD deployed is unknown once one position lacks it; SOL always sums", () => {
    expect(deployed([row(45), row(45)])).toEqual({ sol: 0.5, usd: 90 });
    expect(deployed([row(45), row(null)])).toEqual({ sol: 0.5, usd: null });
  });
});

describe("LLM spend", () => {
  test("each key source against its own cap", () => {
    const s = spendVsCap(
      [
        { provider: "claude", keySource: "vexis", usd: 0.5, runs: 3 },
        { provider: "openai", keySource: "vexis", usd: 0.5, runs: 3 },
        { provider: "claude", keySource: "own", usd: 3, runs: 3 },
      ],
      { vexisDailyUsd: 2, guardrails: parseGuardrails({ dailyLlmUsd: 1 }) },
    );
    expect(s.vexis).toEqual({ usd: 1, cap: 2, share: 0.5 });
    expect(s.own).toEqual({ usd: 3, cap: 1, share: 1 });
    expect(spendVsCap([], { vexisDailyUsd: 0, guardrails: parseGuardrails({}) }).vexis.share).toBe(0);
  });

  test("own keys missing for a picked provider", () => {
    const models = {
      scout: claude,
      strategist: { provider: "openai" as const, model: "gpt-6-luna" },
      risk: null,
      manager: null,
    };
    expect(missingKeys({ keySource: "own", models, savedKeys: ["claude"] })).toEqual([
      { agent: "strategist", provider: "openai" },
    ]);
    expect(missingKeys({ keySource: "vexis", models, savedKeys: [] })).toEqual([]);
  });
});

describe("floor animation", () => {
  test("bubbles keep only each agent's recent latest message", () => {
    const b = bubbles(
      [
        message({ id: "a", agent: "scout", text: "old", at: NOW - 5000 }),
        message({ id: "b", agent: "scout", text: "new", at: NOW - 1000 }),
        message({ id: "c", agent: "risk", at: NOW - BUBBLE_MS }),
      ],
      NOW,
    );
    expect(Object.keys(b)).toEqual(["scout"]);
    expect(b.scout?.text).toBe("new");
  });

  test("only unseen messages start a walk, oldest first", () => {
    const w = walks(new Set(["a"]), [
      message({ id: "c", agent: "manager", at: NOW }),
      message({ id: "a", agent: "strategist", at: NOW - 2000 }),
      message({ id: "b", agent: "strategist", at: NOW - 1000 }),
      message({ id: "d", agent: "scout", at: NOW - 500 }),
      message({ id: "e", agent: "executor", at: NOW - 200 }),
    ]);
    expect(w).toEqual([
      { walker: "scout", to: "strategist" },
      { walker: "executor", to: "terminal" },
      { walker: "risk", to: "manager" },
    ]);
  });
});
