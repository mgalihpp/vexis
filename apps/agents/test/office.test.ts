import { describe, expect, test } from "bun:test";
import { EXECUTION_FAILING, Guardrails, KILL_SWITCH, RiskNotes } from "@vexis/shared/office";
import type { PositionPnl } from "@vexis/shared/pnl";
import { Effect, Layer } from "effect";
import { BOOK_DELAY_MS, officeBookkeeper } from "../src/office/bookkeeper.ts";
import { officeExecutor } from "../src/office/executor.ts";
import { officeMonitor } from "../src/office/monitor.ts";
import { type MonitorReading, monitorProposal } from "../src/office/monitor-rules.ts";
import { rebalanceCycle } from "../src/rebalance/rebalance.ts";
import { WalletLock } from "../src/services/wallet-lock.ts";
import {
  chainPosition,
  fakeChain,
  fakeDb,
  fakeMeteora,
  fakeTelegram,
  fakeZap,
  link,
  poolState,
  rebalanceWatch,
  runAt,
  T0,
  TEST_RPC,
  testConfig,
  testWallet,
} from "./fakes.ts";
import { fakeOfficeDb, journalRow, OFFICE_POOL, officeProposal, officeRow } from "./office-fakes.ts";

const SOL = 1_000_000_000n;
const g = Guardrails.parse({});

function setup(seed: Parameters<typeof fakeOfficeDb>[0] = {}, nativeLamports = 2n * SOL) {
  const office = fakeOfficeDb(seed);
  const db = fakeDb();
  db.state.wallets.set("user-1", testWallet());
  const chain = fakeChain({
    [OFFICE_POOL]: poolState({ nativeLamports, positions: [chainPosition({ amountY: SOL / 5n })] }),
  });
  const zap = fakeZap();
  const layer = Layer.mergeAll(office.layer, db.layer, chain.layer, zap.layer, WalletLock.layer);
  const run = <A, E>(effect: Effect.Effect<A, E, Layer.Success<typeof layer>>, at = T0) =>
    runAt(effect.pipe(Effect.provide(layer)), at);
  return { office: office.state, db: db.state, chain: chain.state, zap: zap.state, run };
}

const live = () => officeRow({ live: true });

describe("office executor", () => {
  test("Preview simulates an approved open: a simulated journal row, nothing sent", async () => {
    const s = setup({ proposals: [officeProposal()] });
    await s.run(officeExecutor());
    expect(s.office.proposals[0]).toMatchObject({ status: "done", simulated: true, signature: null });
    expect(s.office.journal).toMatchObject([{ simulated: true, amountSol: 0.2, amountUsd: 30 }]);
    expect(s.zap.opens).toEqual([]);
  });

  test("Live opens through Zap with the reserve, then journals the real position", async () => {
    const s = setup({
      offices: [live()],
      proposals: [officeProposal({ params: { ...officeProposal().params, singleSidedSol: true } })],
    });
    await s.run(officeExecutor());
    expect(s.zap.opens).toEqual([
      {
        poolAddress: OFFICE_POOL,
        strategy: "Spot",
        lowerBin: 100,
        upperBin: 120,
        amountSol: 0.2,
        singleSidedSol: true,
        slippageBps: 50,
        reserveLamports: SOL / 10n,
      },
    ]);
    expect(s.office.proposals[0]).toMatchObject({ status: "done", simulated: false, signature: "OPEN1" });
    expect(s.office.journal).toMatchObject([{ simulated: false, positionAddress: "NEWPOS1", amountSol: 0.2 }]);
  });

  test("the guardrails run again before signing: a wallet that fell under the reserve stops the open", async () => {
    const s = setup({ offices: [live()], proposals: [officeProposal()] }, SOL / 4n);
    await s.run(officeExecutor());
    expect(s.office.proposals[0]).toMatchObject({ status: "rejected", decidedBy: "risk" });
    const failed = RiskNotes.parse(s.office.proposals[0]?.riskNotes).checks.filter((c) => !c.ok);
    expect(failed.map((c) => c.rule)).toContain("sol_reserve");
    expect(s.zap.opens).toEqual([]);
  });

  test("an unknown day-start capital stops an open, since the daily loss cannot be read", async () => {
    const s = setup({ offices: [officeRow({ live: true, dayCapitalAt: null })], proposals: [officeProposal()] });
    await s.run(officeExecutor());
    expect(s.office.proposals[0]).toMatchObject({ status: "rejected", decidedBy: "risk" });
  });

  test("a paused office runs nothing it approved before the pause", async () => {
    const paused = officeRow({ live: true, paused: true, pausedReason: KILL_SWITCH });
    const s = setup({ offices: [paused], proposals: [officeProposal()] });
    await s.run(officeExecutor());
    expect(s.office.proposals[0]).toMatchObject({ status: "rejected", decidedBy: "system" });
    expect(s.zap.opens).toEqual([]);
  });

  test("a live close closes the journal row with its reason and swaps back to SOL", async () => {
    const s = setup({
      offices: [live()],
      journal: [journalRow()],
      proposals: [officeProposal({ kind: "close", positionAddress: "POS1", params: { reason: "stop_loss" } })],
    });
    await s.run(officeExecutor());
    expect(s.zap.closes).toEqual([
      { poolAddress: OFFICE_POOL, positionAddress: "POS1", swapToSol: true, slippageBps: 50 },
    ]);
    expect(s.office.journal[0]).toMatchObject({ closeReason: "stop_loss", closeProposalId: "proposal-1" });
    expect(s.office.journal[0]?.closedAt).not.toBeNull();
  });

  test("never touches a position the office did not open", async () => {
    const s = setup({
      offices: [live()],
      proposals: [officeProposal({ kind: "close", positionAddress: "SOMEONE", params: { reason: "manual" } })],
    });
    await s.run(officeExecutor());
    expect(s.office.proposals[0]).toMatchObject({ status: "rejected", decidedBy: "risk" });
    expect(s.zap.closes).toEqual([]);
  });

  test("failures in a row pause the office and the rest waits", async () => {
    const proposals = ["a", "b", "c", "d"].map((id, i) =>
      officeProposal({ id, poolAddress: `POOL${i}`, kind: "claim", positionAddress: `POS${i}`, params: { feeSol: 1 } }),
    );
    const journal = proposals.map((p, i) =>
      journalRow({ id: `j${i}`, poolAddress: p.poolAddress, positionAddress: `POS${i}` }),
    );
    const s = setup({ offices: [live()], proposals, journal });
    for (const p of proposals) s.chain.pools[p.poolAddress] = poolState({ nativeLamports: 2n * SOL });
    s.zap.failClaim = "simulation failed";
    await s.run(officeExecutor());
    expect(s.office.proposals.map((p) => p.status)).toEqual(["failed", "failed", "failed", "approved"]);
    expect(s.office.offices[0]).toMatchObject({ paused: true, pausedReason: EXECUTION_FAILING });
  });

  test("an auto-rebalance agent and the office never send on one wallet at once", async () => {
    const office = fakeOfficeDb({
      offices: [live()],
      journal: [journalRow({ poolAddress: "POOL2" })],
      proposals: [
        officeProposal({
          kind: "rebalance",
          poolAddress: "POOL2",
          positionAddress: "POS1",
          params: { strategy: "Spot", activeBin: 130, lowerBin: 120, upperBin: 140 },
        }),
      ],
    });
    const db = fakeDb({
      rebalances: [rebalanceWatch({ config: { strategy: "Curve", dryRun: false, cooldownSec: 300 } })],
    });
    db.state.chats.set(link("user-1", "auto-rebalance"), 42n);
    db.state.wallets.set("user-1", testWallet());
    const chain = fakeChain({
      POOL1: poolState({ activeBinId: 130 }),
      POOL2: poolState({ activeBinId: 130, nativeLamports: 2n * SOL }),
    });
    const zap = fakeZap();
    const layer = Layer.mergeAll(
      office.layer,
      db.layer,
      chain.layer,
      zap.layer,
      fakeTelegram().layer,
      WalletLock.layer,
      testConfig,
    );
    const both = Effect.all([rebalanceCycle(), officeExecutor()], { concurrency: "unbounded" });
    await runAt(both.pipe(Effect.provide(layer)));
    expect(zap.state.calls.map((c) => c.request.poolAddress).toSorted()).toEqual(["POOL1", "POOL2"]);
    expect(zap.state.maxInFlight).toBe(1);
  });
});

describe("office monitor", () => {
  test("stores the position's value and proposes a stop loss", async () => {
    const s = setup({ offices: [live()], journal: [journalRow()] });
    s.chain.pools[OFFICE_POOL] = poolState({ positions: [chainPosition({ amountY: (SOL * 18n) / 100n })] });
    await s.run(officeMonitor());
    expect(s.chain.calls).toEqual([{ rpcUrl: TEST_RPC, pool: OFFICE_POOL, owner: "OWNER1" }]);
    expect(s.office.journal[0]).toMatchObject({ valueSol: 0.18, valuedAt: new Date(T0) });
    expect(s.office.proposals).toMatchObject([
      {
        kind: "close",
        status: "draft",
        proposedBy: "monitor",
        positionAddress: "POS1",
        params: { reason: "stop_loss" },
      },
    ]);
  });

  test("asks at most once per cooldown, and never on a pool an auto-rebalance agent manages", async () => {
    const out = poolState({ activeBinId: 125, positions: [chainPosition({ amountY: SOL / 5n })] });
    const quiet = setup({
      offices: [live()],
      journal: [journalRow()],
      proposals: [officeProposal({ status: "rejected", createdAt: new Date(T0 - 60_000) })],
    });
    quiet.chain.pools[OFFICE_POOL] = out;
    await quiet.run(officeMonitor());
    expect(quiet.office.proposals).toHaveLength(1);

    const managed = setup({ offices: [live()], journal: [journalRow()] });
    managed.chain.pools[OFFICE_POOL] = out;
    managed.office.rebalancePools.set("user-1", [OFFICE_POOL]);
    await managed.run(officeMonitor());
    expect(managed.office.proposals).toEqual([]);
    expect(managed.office.journal[0]?.valuedAt).toEqual(new Date(T0));
  });

  test("simulated positions are never read", async () => {
    const s = setup({ journal: [journalRow({ simulated: true })] });
    await s.run(officeMonitor());
    expect(s.chain.calls).toEqual([]);
  });
});

describe("monitorProposal", () => {
  const reading = (o: Partial<MonitorReading> = {}): MonitorReading => ({
    costSol: 1,
    valueSol: 1,
    feeSol: 0,
    activeBin: 110,
    lowerBin: 100,
    upperBin: 120,
    strategy: "Curve",
    ...o,
  });
  const kind = (o: Partial<MonitorReading>) => monitorProposal(g, reading(o))?.proposal;

  test.each([
    ["take profit at +10%", { valueSol: 1.1 }, { kind: "close", params: { reason: "take_profit" } }],
    ["stop loss at -5%", { valueSol: 0.95 }, { kind: "close", params: { reason: "stop_loss" } }],
    [
      "just out of range: re-centered with the same width",
      { activeBin: 125 },
      { kind: "rebalance", params: { strategy: "Curve", activeBin: 125, lowerBin: 115, upperBin: 135 } },
    ],
    ["more than a range-width out: closed", { activeBin: 141 }, { kind: "close", params: { reason: "out_of_range" } }],
    ["fees at 1% of cost: claimed", { feeSol: 0.01 }, { kind: "claim", params: { feeSol: 0.01 } }],
  ] as const)("%s", (_, o, expected) => {
    expect(kind(o)).toEqual(expected);
  });

  test.each([
    ["in range, small move, small fees", {}],
    ["just under the stop loss", { valueSol: 0.9501 }],
    ["no SOL side: no value, no fees", { valueSol: null, feeSol: null }],
  ] as const)("nothing due: %s", (_, o) => {
    expect(kind(o)).toBeUndefined();
  });
});

describe("office bookkeeper", () => {
  const closed = (o: Partial<PositionPnl> = {}): PositionPnl => {
    const side = (sol: number, usd: number) => ({ total: { sol, usd } });
    return {
      positionAddress: "POS1",
      isClosed: true,
      lowerBinId: 100,
      upperBinId: 120,
      minPrice: 0,
      maxPrice: 0,
      allTimeDeposits: side(0.2, 30),
      allTimeWithdrawals: side(0.19, 29),
      allTimeFees: side(0.02, 3),
      pnlSol: null,
      pnlUsd: 2,
      ...o,
    };
  };

  function bookSetup(journal: ReturnType<typeof journalRow>[]) {
    const office = fakeOfficeDb({ journal });
    const meteora = fakeMeteora();
    const layer = Layer.merge(office.layer, meteora.layer);
    const run = (at = T0) => runAt(officeBookkeeper().pipe(Effect.provide(layer)), at);
    return { office: office.state, meteora: meteora.state, run };
  }
  const closedAt = new Date(T0 - BOOK_DELAY_MS);

  test("reads a close's PnL like the portfolio, one request for a pool's closes", async () => {
    const s = bookSetup([
      journalRow({ walletAddress: "OWNER1", closedAt }),
      journalRow({ id: "journal-2", positionAddress: "POS2", walletAddress: "OWNER1", closedAt }),
    ]);
    s.meteora.closed.set(OFFICE_POOL, [closed(), closed({ positionAddress: "POS2", pnlSol: -0.05, pnlUsd: -7.5 })]);
    await s.run();
    expect(s.meteora.pnlCalls).toEqual([`${OFFICE_POOL} OWNER1`]);
    // No pnlSol from Meteora: withdrawals plus fees minus deposits, as the portfolio computes it.
    expect(s.office.journal[0]?.pnlSol).toBeCloseTo(0.01);
    expect(s.office.journal.map((j) => [j.pnlUsd, j.pnlCheckedAt])).toEqual([
      [2, new Date(T0)],
      [-7.5, new Date(T0)],
    ]);
    expect(s.office.journal[1]?.pnlSol).toBe(-0.05);
  });

  test("waits for Meteora to index the close, then reads it once; what it lacks stays unknown", async () => {
    const s = bookSetup([journalRow({ walletAddress: "OWNER1", closedAt: new Date(T0 - 60_000) })]);
    await s.run();
    expect(s.meteora.pnlCalls).toEqual([]);
    await s.run(T0 + BOOK_DELAY_MS);
    await s.run(T0 + BOOK_DELAY_MS + 60_000);
    expect(s.meteora.pnlCalls).toHaveLength(1);
    expect(s.office.journal[0]).toMatchObject({
      pnlSol: null,
      pnlUsd: null,
      pnlCheckedAt: new Date(T0 + BOOK_DELAY_MS),
    });
  });

  test("open and simulated positions are never read", async () => {
    const s = bookSetup([journalRow(), journalRow({ id: "sim", simulated: true, closedAt })]);
    await s.run();
    expect(s.meteora.pnlCalls).toEqual([]);
  });
});
