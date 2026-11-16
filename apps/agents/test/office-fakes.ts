import { OPEN_STATUSES, transition } from "@vexis/db/office";
import { Effect, Layer } from "effect";
import {
  type JournalRow,
  type OfficeConfigRow,
  OfficeDb,
  type OfficeMessage,
  type OfficeWallet,
  type ProposalRow,
} from "../src/services/office-db.ts";
import { T0, TEST_RPC } from "./fakes.ts";

export const OFFICE_POOL = "POOL1";

export function officeRow(overrides: Partial<OfficeConfigRow> = {}): OfficeConfigRow {
  return {
    userId: "user-1",
    mode: "approval",
    paused: false,
    pausedReason: null,
    pausedUntil: null,
    live: false,
    dayCapitalSol: 10,
    dayCapitalAt: new Date(T0),
    guardrails: {},
    models: {},
    keySource: "vexis",
    llmKeys: {},
    vexisDailyUsd: 1,
    walletSource: "user",
    officePublicKey: null,
    officeSecretKey: null,
    officeRpcUrl: null,
    poolPreset: "blue-chip",
    poolFilter: null,
    createdAt: new Date(T0),
    updatedAt: new Date(T0),
    ...overrides,
  };
}

export function officeProposal(overrides: Partial<ProposalRow> = {}): ProposalRow {
  return {
    id: "proposal-1",
    userId: "user-1",
    kind: "open",
    status: "approved",
    poolAddress: OFFICE_POOL,
    poolName: "JUP-SOL",
    positionAddress: null,
    params: { strategy: "Spot", activeBin: 110, lowerBin: 100, upperBin: 120, amountSol: 0.2, solUsd: 150 },
    rationale: "Deep pool.",
    riskNotes: null,
    summary: null,
    proposedBy: "strategist",
    runId: null,
    decidedBy: "owner",
    simulated: true,
    signature: null,
    txError: null,
    expiresAt: new Date(T0 + 900_000),
    telegramMessageId: null,
    createdAt: new Date(T0 - 60_000),
    updatedAt: new Date(T0 - 60_000),
    ...overrides,
  };
}

/** A real office position POS1 in POOL1 that cost 0.2 SOL, valued at cost a minute ago. */
export function journalRow(overrides: Partial<JournalRow> = {}): JournalRow {
  return {
    id: "journal-1",
    userId: "user-1",
    openProposalId: "open-1",
    closeProposalId: null,
    poolAddress: OFFICE_POOL,
    poolName: "JUP-SOL",
    positionAddress: "POS1",
    simulated: false,
    amountSol: 0.2,
    amountUsd: 30,
    valueSol: 0.2,
    valuedAt: new Date(T0 - 60_000),
    openReason: "Deep pool.",
    openedAt: new Date(T0 - 3_600_000),
    closeReason: null,
    closedAt: null,
    pnlSol: null,
    pnlUsd: null,
    ...overrides,
  };
}

/** In-memory `OfficeDb`, state exposed for assertions. */
export function fakeOfficeDb(
  seed: { offices?: OfficeConfigRow[]; proposals?: ProposalRow[]; journal?: JournalRow[] } = {},
) {
  const state = {
    offices: seed.offices ?? [officeRow()],
    proposals: seed.proposals ?? [],
    journal: seed.journal ?? [],
    messages: [] as (OfficeMessage & { userId: string })[],
    wallets: new Map<string, OfficeWallet>([["user-1", { _tag: "ready", owner: "OWNER1", rpcUrl: TEST_RPC }]]),
    rebalancePools: new Map<string, string[]>(),
    /** Open params by proposal id, for the Monitor's strategy. */
    openParams: new Map<string, unknown>([["open-1", { strategy: "Curve" }]]),
  };
  let ids = 0;
  const mine = (userId: string) => state.proposals.filter((p) => p.userId === userId);
  const layer = Layer.succeed(
    OfficeDb,
    OfficeDb.of({
      offices: () => Effect.sync(() => [...state.offices]),
      usersWithApproved: () =>
        Effect.sync(() => [...new Set(state.proposals.filter((p) => p.status === "approved").map((p) => p.userId))]),
      proposals: (userId, statuses) => Effect.sync(() => mine(userId).filter((p) => statuses.includes(p.status))),
      move: (userId, id, from, to, patch = {}) =>
        Effect.sync(() => {
          const p = mine(userId).find((r) => r.id === id && r.status === from);
          return p && Object.assign(p, patch, { status: transition(from, to), updatedAt: new Date(T0 + ++ids) });
        }),
      insertProposal: (userId, p) =>
        Effect.sync(() => {
          if (mine(userId).some((r) => r.poolAddress === p.poolAddress && OPEN_STATUSES.includes(r.status))) return;
          const row = officeProposal({
            ...p,
            id: `new-${++ids}`,
            userId,
            status: "draft",
            decidedBy: null,
            createdAt: new Date(T0),
          });
          state.proposals.push(row);
          return row;
        }),
      book: (userId, since) =>
        Effect.sync(() => {
          const rows = state.journal.filter((j) => j.userId === userId);
          return {
            open: rows.filter((j) => !j.closedAt),
            closedToday: rows.filter((j) => j.closedAt && j.closedAt >= since),
          };
        }),
      insertJournal: (userId, j) =>
        Effect.sync(() => {
          state.journal.push(
            journalRow({ positionAddress: null, valueSol: null, valuedAt: null, ...j, id: `journal-${++ids}`, userId }),
          );
        }),
      closeJournal: (userId, id, close) =>
        Effect.sync(() => {
          const j = state.journal.find((r) => r.id === id && r.userId === userId && !r.closedAt);
          if (j) Object.assign(j, close, { closedAt: new Date() });
        }),
      setJournalValue: (userId, id, valueSol, at) =>
        Effect.sync(() => {
          const j = state.journal.find((r) => r.id === id && r.userId === userId);
          if (j) Object.assign(j, { valueSol, valuedAt: at });
        }),
      livePositions: () =>
        Effect.sync(() =>
          state.journal
            .filter((j) => !j.closedAt && !j.simulated)
            .map((journal) => ({ journal, openParams: state.openParams.get(journal.openProposalId ?? "") ?? null })),
        ),
      message: (userId, m) => Effect.sync(() => void state.messages.push({ userId, ...m })),
      pause: (userId, reason) =>
        Effect.sync(() => {
          const o = state.offices.find((r) => r.userId === userId);
          if (o) Object.assign(o, { paused: true, pausedReason: reason, pausedUntil: null });
        }),
      liveExecutions: (userId, limit) =>
        Effect.sync(() =>
          mine(userId)
            .filter((p) => !p.simulated && (p.status === "done" || p.status === "failed"))
            .toSorted((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
            .slice(0, limit),
        ),
      lastExecutionAt: () => Effect.succeed(null),
      lastProposalAt: (userId, pool) =>
        Effect.sync(() => {
          const times = mine(userId)
            .filter((p) => p.poolAddress === pool)
            .map((p) => p.createdAt.getTime());
          return times.length === 0 ? null : new Date(Math.max(...times));
        }),
      rebalancePools: (userId) => Effect.sync(() => new Set(state.rebalancePools.get(userId) ?? [])),
      wallet: (office) => Effect.sync(() => state.wallets.get(office.userId) ?? { _tag: "missing" }),
    }),
  );
  return { state, layer };
}
