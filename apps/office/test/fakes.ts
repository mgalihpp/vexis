import {
  isPaused,
  KILL_SWITCH,
  type LlmAgent,
  OPEN_STATUSES,
  ownerCanResume,
  pauseOf,
  refuseDecision,
  transition,
  utcDayStart,
} from "@vexis/db/office";
import type { JournalRow, MessageRow, OfficeConfigRow, ProposalRow, RunRow, ThreadRow } from "@vexis/db/office-queries";
import { Effect, Layer, Redacted } from "effect";
import { TestClock } from "effect/testing";
import { AppConfig } from "../src/config.ts";
import { ChainError, LlmError, MeteoraError, TelegramError } from "../src/errors.ts";
import type { OfficePool } from "../src/pools.ts";
import { Chain, type PoolBins } from "../src/services/chain.ts";
import { type BotTarget, Db, type Spike, type WalletTarget } from "../src/services/db.ts";
import { Llm, type LlmRequest } from "../src/services/llm.ts";
import { Meteora, Screener } from "../src/services/meteora.ts";
import { OfficeState } from "../src/services/state.ts";
import { Telegram } from "../src/services/telegram.ts";
import type { Button, Update } from "../src/telegram.ts";

export const MINUTE = 60_000;
export const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);
export const POOL = "JUPpool1111111111111111111111111111111111";
export const OTHER_POOL = "BONKpool111111111111111111111111111111111";
export const TEST_RPC = "https://rpc.test/?api-key=secret-key";
export const PROPOSAL_ID = "0b6f1d8e-3c4a-4d7e-9f10-2a3b4c5d6e7f";
export const CHAT = 4242;
export const BOT_TOKEN = "fake-bot-token";

/** Runs an effect at `at` on a TestClock. The one `runPromise` is the test boundary. */
export const runAt = <A, E>(effect: Effect.Effect<A, E>, at: number = T0) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(at);
      return yield* effect;
    }).pipe(Effect.provide(TestClock.layer())),
  );

const haiku = { provider: "claude", model: "claude-haiku-5-5" } as const;
export const ALL_MODELS = { scout: haiku, strategist: haiku, risk: haiku, manager: haiku };

export function office(overrides: Partial<OfficeConfigRow> = {}): OfficeConfigRow {
  return {
    userId: "user-1",
    mode: "approval",
    paused: false,
    pausedReason: null,
    pausedUntil: null,
    guardrails: {},
    models: ALL_MODELS,
    keySource: "vexis",
    llmKeys: {},
    vexisDailyUsd: 1,
    walletSource: "user",
    officePublicKey: null,
    officeSecretKey: null,
    officeRpcUrl: null,
    officeRpcHost: null,
    poolPreset: "blue-chip",
    poolFilter: null,
    live: false,
    dayCapitalSol: null,
    dayCapitalAt: null,
    createdAt: new Date(T0),
    updatedAt: new Date(T0),
    ...overrides,
  };
}

export const openParams = {
  strategy: "Spot",
  activeBin: 100,
  lowerBin: 90,
  upperBin: 110,
  amountSol: 1,
  solUsd: 150,
  singleSidedSol: false,
};

export function proposal(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: "proposal-1",
    userId: "user-1",
    kind: "open",
    status: "draft",
    poolAddress: POOL,
    poolName: "JUP-SOL",
    positionAddress: null,
    params: openParams,
    rationale: "Deep pool with steady fees.",
    riskNotes: null,
    summary: null,
    proposedBy: "strategist",
    runId: null,
    decidedBy: null,
    simulated: true,
    signature: null,
    txError: null,
    expiresAt: new Date(T0 + 15 * MINUTE),
    telegramMessageId: null,
    createdAt: new Date(T0),
    updatedAt: new Date(T0),
    ...overrides,
  };
}

/** An office journal row: a real 1 SOL position opened at T0 unless overridden. */
export function journal(overrides: Partial<JournalRow> = {}): JournalRow {
  return {
    id: "journal-1",
    userId: "user-1",
    openProposalId: null,
    closeProposalId: null,
    poolAddress: POOL,
    poolName: "JUP-SOL",
    positionAddress: null,
    simulated: false,
    amountSol: 1,
    amountUsd: null,
    valueSol: null,
    valuedAt: null,
    openReason: "test",
    openedAt: new Date(T0),
    closeReason: null,
    closedAt: null,
    pnlSol: null,
    pnlUsd: null,
    walletAddress: null,
    pnlCheckedAt: null,
    ...overrides,
  };
}

/** In-memory `Db`: the same contract as the Postgres one, state exposed for assertions. */
export function fakeDb(seed: { offices?: OfficeConfigRow[]; proposals?: ProposalRow[] } = {}) {
  const state = {
    offices: seed.offices ?? [office()],
    proposals: seed.proposals ?? [],
    messages: [] as Pick<MessageRow, "userId" | "agent" | "text" | "tone" | "poolAddress" | "proposalId">[],
    runs: [] as (Omit<RunRow, "inputTokens" | "outputTokens" | "costUsd" | "error"> & Partial<RunRow>)[],
    threads: new Map<string, ThreadRow>(),
    journal: [] as JournalRow[],
    alerts: [] as (Spike & { userId: string })[],
    rebalancePools: new Map<string, string[]>(),
    wallets: new Map<string, WalletTarget>([["user-1", { _tag: "ready", owner: "OWNER1", rpcUrl: TEST_RPC }]]),
    /** Office bots by user; none is linked unless a test adds one. */
    bots: new Map<string, BotTarget & { offset?: number | null }>(),
  };
  let ids = 0;
  const id = (prefix: string) => `${prefix}-${++ids}`;
  const mine = (userId: string) => state.proposals.filter((p) => p.userId === userId);

  const layer = Layer.succeed(
    Db,
    Db.of({
      listOffices: () => Effect.sync(() => [...state.offices]),
      heartbeat: () => Effect.void,
      heartbeats: () => Effect.succeed([]),
      markAlerted: () => Effect.void,
      expire: (userId, now) =>
        Effect.sync(() =>
          mine(userId)
            .filter((p) => ["risk_checked", "awaiting_approval"].includes(p.status) && p.expiresAt < now)
            .map((p) => Object.assign(p, { status: "expired", decidedBy: "system" })),
        ),
      proposals: (userId, statuses) => Effect.sync(() => mine(userId).filter((p) => statuses.includes(p.status))),
      move: (userId, proposalId, from, to, patch = {}) =>
        Effect.sync(() => {
          const p = mine(userId).find((r) => r.id === proposalId && r.status === from);
          return p && Object.assign(p, patch, { status: transition(from, to) });
        }),
      insertProposal: (userId, p) =>
        Effect.sync(() => {
          if (mine(userId).some((r) => r.poolAddress === p.poolAddress && OPEN_STATUSES.includes(r.status))) return;
          const row = proposal({ ...p, id: id("proposal"), userId, status: "draft" });
          state.proposals.push(row);
          return row;
        }),
      message: (userId, m) =>
        Effect.sync(() => {
          state.messages.push({ userId, poolAddress: null, proposalId: null, tone: null, ...m });
        }),
      insertRun: (userId, r) =>
        Effect.sync(() => {
          const runId = id("run");
          state.runs.push({ id: runId, userId, at: new Date(), ...r });
          return runId;
        }),
      saveThread: (userId, t) =>
        Effect.sync(() => {
          state.threads.set(`${userId}:${t.agent}`, {
            ...t,
            userId,
            reply: t.reply ?? null,
            inputTokens: t.inputTokens ?? null,
            outputTokens: t.outputTokens ?? null,
            costUsd: t.costUsd ?? null,
            error: t.error ?? null,
          });
        }),
      spendToday: (userId, now) =>
        Effect.sync(() => {
          const runs = state.runs.filter((r) => r.userId === userId && r.at >= utcDayStart(now));
          return ["vexis", "own"].map((keySource) => ({
            keySource,
            usd: runs.filter((r) => r.keySource === keySource).reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
          }));
        }),
      openJournal: (userId) => Effect.sync(() => state.journal.filter((j) => j.userId === userId && !j.closedAt)),
      book: (userId, since) =>
        Effect.sync(() => {
          const mineJ = state.journal.filter((j) => j.userId === userId);
          return {
            open: mineJ.filter((j) => !j.closedAt),
            closedToday: mineJ.filter((j) => j.closedAt && j.closedAt >= since),
          };
        }),
      setDayCapital: (userId, capitalSol, now) =>
        Effect.sync(() => {
          const row = state.offices.find((o) => o.userId === userId);
          if (row && (row.dayCapitalAt === null || row.dayCapitalAt < utcDayStart(now))) {
            Object.assign(row, { dayCapitalSol: capitalSol, dayCapitalAt: now });
          }
        }),
      lastExecutionAt: () => Effect.succeed(null),
      rebalancePools: (userId) => Effect.sync(() => new Set(state.rebalancePools.get(userId) ?? [])),
      spikesSince: (userId, since) =>
        Effect.sync(() => state.alerts.filter((a) => a.userId === userId && a.at > since)),
      wallet: (row) => Effect.sync(() => state.wallets.get(row.userId) ?? { _tag: "missing" }),
      officeBot: (userId) => Effect.sync(() => state.bots.get(userId) ?? { _tag: "missing" }),
      polledBots: () =>
        Effect.sync(() =>
          [...state.bots].flatMap(([userId, b]) =>
            b._tag === "ready" ? [{ userId, token: b.token, chatId: b.chatId, offset: b.offset ?? null }] : [],
          ),
        ),
      setUpdateOffset: (userId, offset) =>
        Effect.sync(() => {
          const bot = state.bots.get(userId);
          if (bot) state.bots.set(userId, { ...bot, offset });
        }),
      setCard: (userId, proposalId, messageId) =>
        Effect.sync(() => {
          const p = mine(userId).find((r) => r.id === proposalId);
          if (p) p.telegramMessageId = messageId;
        }),
      settledCards: (userId) =>
        Effect.sync(() => mine(userId).filter((p) => p.telegramMessageId !== null && p.status !== "awaiting_approval")),
      decide: (userId, proposalId, decision, now) =>
        Effect.sync(() => {
          const row = state.offices.find((o) => o.userId === userId);
          const p = mine(userId).find((r) => r.id === proposalId);
          const refusal = refuseDecision(row && pauseOf(row), p, decision, now.getTime());
          if (refusal || !p) return { ok: false, refusal: refusal ?? "not_found" } as const;
          const status = transition(p.status, decision === "approve" ? "approved" : "rejected");
          return { ok: true, proposal: Object.assign(p, { status, decidedBy: "owner" as const }) } as const;
        }),
      kill: (userId) =>
        Effect.sync(() => {
          const row = state.offices.find((o) => o.userId === userId);
          if (!row) return null;
          Object.assign(row, { paused: true, pausedReason: KILL_SWITCH, pausedUntil: null });
          const open = mine(userId).filter((p) =>
            ["draft", "risk_checked", "awaiting_approval", "approved"].includes(p.status),
          );
          for (const p of open) Object.assign(p, { status: "rejected", decidedBy: "kill_switch" });
          return open.length;
        }),
      resume: (userId, now) =>
        Effect.sync(() => {
          const row = state.offices.find((o) => o.userId === userId);
          if (!row) return "no_office" as const;
          const pause = pauseOf(row);
          if (!isPaused(pause, now.getTime())) return "running" as const;
          if (!ownerCanResume(pause)) return "locked" as const;
          Object.assign(row, { paused: false, pausedReason: null, pausedUntil: null });
          return "resumed" as const;
        }),
      setPause: (userId, pause) =>
        Effect.sync(() => {
          const row = state.offices.find((o) => o.userId === userId);
          if (row) {
            Object.assign(
              row,
              pause
                ? { paused: true, pausedReason: pause.reason, pausedUntil: pause.until }
                : { paused: false, pausedReason: null, pausedUntil: null },
            );
          }
        }),
    }),
  );
  return { state, layer };
}

/** A blue-chip pool that passes the office's screen. */
export function pool(overrides: Partial<OfficePool> = {}): OfficePool {
  return {
    address: POOL,
    name: "JUP-SOL",
    feeTvl24h: 0.4,
    tvl: 2_000_000,
    volume24h: 3_000_000,
    binStep: 10,
    blacklisted: false,
    baseMcap: 1_000_000_000,
    bothVerified: true,
    baseOrganic: null,
    freezable: false,
    ...overrides,
  };
}

/** Meteora stand-in that counts screener requests. */
export function fakeMeteora(pools: OfficePool[] = [pool()]) {
  const state = { pools, solUsd: 150 as number | null, calls: 0, failing: false };
  const layer = Layer.succeed(
    Meteora,
    Meteora.of({
      screener: () =>
        Effect.suspend(() => {
          state.calls++;
          return state.failing
            ? Effect.fail(new MeteoraError({ cause: new Error("down") }))
            : Effect.succeed({ pools: state.pools, solUsd: state.solUsd });
        }),
    }),
  );
  return { state, layer };
}

/** Chain stand-in: every pool's bins and one wallet balance. */
export function fakeChain(bins: Record<string, PoolBins> = { [POOL]: { activeBin: 100, binStep: 10 } }) {
  const state = { bins, balanceSol: 10, calls: [] as string[] };
  const layer = Layer.succeed(
    Chain,
    Chain.of({
      pool: (rpcUrl, address) =>
        Effect.suspend(() => {
          state.calls.push(`${rpcUrl} ${address}`);
          const found = state.bins[address];
          return found ? Effect.succeed(found) : Effect.fail(new ChainError({ message: "rpc down" }));
        }),
      balanceSol: () => Effect.sync(() => state.balanceSol),
    }),
  );
  return { state, layer };
}

/** What each desk answers when asked; a missing reply fails the call. */
export const REPLIES: Record<LlmAgent, string> = {
  scout: JSON.stringify({ candidates: [{ pool: POOL, reason: "Best fees for its depth." }] }),
  strategist: JSON.stringify({
    action: "open",
    pool: POOL,
    strategy: "Spot",
    lowerBin: 90,
    upperBin: 110,
    amountSol: 1,
    rationale: "Steady volume around the active bin.",
  }),
  risk: JSON.stringify({ veto: false, note: "Range suits the bin step." }),
  manager: JSON.stringify({ summary: "1 SOL Spot in JUP-SOL for its fees. Main risk: a sharp move out of range." }),
};

export function fakeLlm(replies: Partial<Record<LlmAgent, string>> = REPLIES) {
  const state = { replies, calls: [] as LlmRequest[] };
  const layer = Layer.succeed(
    Llm,
    Llm.of({
      complete: (request) =>
        Effect.suspend(() => {
          state.calls.push(request);
          const text = state.replies[request.agent];
          return text === undefined
            ? Effect.fail(new LlmError({ message: `${request.provider}/${request.model}: HTTP 500` }))
            : Effect.succeed({ text, inputTokens: 1000, outputTokens: 200 });
        }),
    }),
  );
  return { state, layer };
}

/** Telegram stand-in: records what was sent, edited and answered; `inbox` is what the next poll returns. */
export function fakeTelegram() {
  const state = {
    sent: [] as { chatId: number; text: string; buttons: readonly Button[]; messageId: number }[],
    edits: [] as { messageId: number; text: string }[],
    answers: [] as { callbackId: string; text: string }[],
    polls: [] as (number | null)[],
    inbox: [] as Update[],
    failing: false,
  };
  const fail = (method: string) => Effect.fail(new TelegramError({ message: `${method}: HTTP 502` }));
  const layer = Layer.succeed(
    Telegram,
    Telegram.of({
      send: (_token, chatId, text, buttons = []) =>
        Effect.suspend(() => {
          if (state.failing) return fail("sendMessage");
          const messageId = 100 + state.sent.length;
          state.sent.push({ chatId, text, buttons, messageId });
          return Effect.succeed(messageId);
        }),
      edit: (_token, _chatId, messageId, text) =>
        Effect.suspend(() => {
          if (state.failing) return fail("editMessageText");
          state.edits.push({ messageId, text });
          return Effect.void;
        }),
      updates: (_token, offset) =>
        Effect.sync(() => {
          state.polls.push(offset);
          const updates = state.inbox.filter((u) => offset === null || u.update_id >= offset);
          state.inbox = [];
          const next = updates.length > 0 ? Math.max(...updates.map((u) => u.update_id)) + 1 : null;
          return { updates, next };
        }),
      answer: (_token, callbackId, text) =>
        Effect.sync(() => {
          state.answers.push({ callbackId, text });
        }),
    }),
  );
  return { state, layer };
}

export const testConfig = Layer.succeed(
  AppConfig,
  AppConfig.of({ vexisKeys: { claude: Redacted.make("vexis-key") }, admin: null }),
);

/** Fresh fakes wired together; `run` gives every tick in one effect the same in-memory state and screener cache. */
export function setup(seed: Parameters<typeof fakeDb>[0] = {}) {
  const db = fakeDb(seed);
  const meteora = fakeMeteora();
  const chain = fakeChain();
  const llm = fakeLlm();
  const telegram = fakeTelegram();
  const layer = Layer.mergeAll(
    db.layer,
    Screener.layer.pipe(Layer.provide(meteora.layer)),
    chain.layer,
    llm.layer,
    OfficeState.layer,
    telegram.layer,
    testConfig,
  );
  const run = <A, E>(
    effect: Effect.Effect<A, E, Db | Screener | Chain | Llm | OfficeState | Telegram | AppConfig>,
    at = T0,
  ) => runAt(effect.pipe(Effect.provide(layer)), at);
  return { db: db.state, meteora: meteora.state, chain: chain.state, llm: llm.state, telegram: telegram.state, run };
}
