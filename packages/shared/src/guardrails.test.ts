import { describe, expect, test } from "bun:test";
import {
  autopilotVerdict,
  type BookPosition,
  checkManage,
  checkOpen,
  dailyCapUsd,
  dailyLossHit,
  dailyLossPct,
  dayPnlSol,
  freeSol,
  type ManageFacts,
  officeCapital,
  type RiskFacts,
  storedDayCapital,
} from "./guardrails.ts";
import { Guardrails } from "./office.ts";
import { type FilterPool, SCREENER_PRESETS } from "./screen.ts";

const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

const pool = (overrides: Partial<FilterPool> = {}): FilterPool => ({
  tvl: 2_000_000,
  volume24h: 3_000_000,
  binStep: 10,
  blacklisted: false,
  baseMcap: 1_000_000_000,
  bothVerified: true,
  baseOrganic: null,
  freezable: false,
  ...overrides,
});

// Defaults: 25% max position, 3 positions, 5% daily loss, 0.1 SOL reserve, 300 s cooldown, $1 own-key budget.
const g = Guardrails.parse({});
const BLUE_CHIP = SCREENER_PRESETS["blue-chip"].filter;

const facts = (overrides: Partial<RiskFacts> = {}): RiskFacts => ({
  params: {
    strategy: "Spot",
    activeBin: 100,
    lowerBin: 90,
    upperBin: 110,
    amountSol: 1,
    solUsd: 150,
    singleSidedSol: false,
    setupSol: 0.06,
  },
  walletSol: 10,
  // Round test numbers: 0.06 SOL rent, so a slot's overhead with the 0.03 fee buffer is 0.09.
  positionRentSol: 0.06,
  dayStartCapital: 10,
  book: { open: [], closedToday: [] },
  pool: pool(),
  rebalanceManaged: false,
  lastExecutionAt: null,
  now: T0,
  llmSpentUsd: 0,
  llmCapUsd: 1,
  ...overrides,
});

/** A real position valued a minute ago. */
const position = (o: Partial<BookPosition> = {}): BookPosition => ({
  amountSol: 1,
  simulated: false,
  valueSol: 1,
  valuedAt: new Date(T0 - 60_000),
  pnlSol: null,
  ...o,
});
const open = (...ps: BookPosition[]) => ({ book: { open: ps, closedToday: [] } });
const closed = (...ps: BookPosition[]) => ({ book: { open: [], closedToday: ps } });

const params = (amountSol: number, setupSol: number | null = 0.06) => ({ ...facts().params, amountSol, setupSol });
const verdict = (rule: string, f: RiskFacts) => checkOpen(g, BLUE_CHIP, f).find((c) => c.rule === rule)?.ok;

describe("checkOpen", () => {
  test("a sound proposal passes every rule", () => {
    expect(checkOpen(g, BLUE_CHIP, facts()).every((c) => c.ok)).toBe(true);
  });

  test.each([
    ["position_size", facts({ params: params(2.5) }), true],
    ["position_size", facts({ params: params(2.51) }), false],
    ["position_size", facts({ walletSol: null }), false],
    // SOL locked in a real position still counts toward the base: 8 free + 2 committed = 10.
    ["position_size", facts({ walletSol: 8, params: params(2.5), ...open(position({ amountSol: 2 })) }), true],
    // 1 SOL over 3 slots: (1 - 0.1 reserve - 3 x 0.09 rent and fees) / 3 = 0.21 each, under the 25% share.
    ["position_size", facts({ walletSol: 1, params: params(0.2) }), true],
    ["position_size", facts({ walletSol: 1, params: params(0.22) }), false],
    // The last free slot takes what is left above the reserve, its rent and fees.
    ["position_size", facts({ walletSol: 0.5, params: params(0.3), ...open(position(), position()) }), true],
    // Two new bin arrays (0.0714 each, never refunded) make this open's setup 0.2029: (1 - 0.1 - 0.2029 - 0.03 - 2 x 0.09) / 3 = 0.162.
    ["position_size", facts({ walletSol: 1, params: params(0.16, 0.2029) }), true],
    ["position_size", facts({ walletSol: 1, params: params(0.17, 0.2029) }), false],
    ["position_size", facts({ params: params(1, null) }), false],
    ["position_size", facts({ positionRentSol: null }), false],
    ["sol_reserve", facts({ walletSol: 0.3, params: params(0.1) }), true],
    ["sol_reserve", facts({ walletSol: 0.5, params: params(0.2, 0.2029) }), false],
    ["sol_reserve", facts({ params: params(1, null) }), false],
    ["sol_reserve", facts({ positionRentSol: null }), false],
    ["sol_reserve", facts({ walletSol: 0.3, params: params(0.12) }), false],
    // A simulated position never left the wallet, so it and its rent and fees are taken off the free SOL.
    ["sol_reserve", facts({ params: params(0.1), ...open(position({ amountSol: 9.6, simulated: true })) }), true],
    ["sol_reserve", facts({ params: params(0.13), ...open(position({ amountSol: 9.6, simulated: true })) }), false],
    ["max_active_positions", facts(open(position(), position())), true],
    ["max_active_positions", facts(open(position(), position(), position())), false],
    ["daily_loss", facts(closed(position({ pnlSol: -0.49 }))), true],
    ["daily_loss", facts(closed(position({ pnlSol: -0.5 }))), false],
    ["daily_loss", facts(open(position({ amountSol: 2, valueSol: 1.5 }))), false],
    ["daily_loss", facts({ dayStartCapital: null }), false],
    ["daily_loss", facts(closed(position({ pnlSol: null }))), false],
    ["daily_loss", facts(open(position({ valuedAt: new Date(T0 - 5 * 60_000 - 1) }))), false],
    // An auto-rebalance agent spending the shared wallet's SOL is not the office's loss.
    ["daily_loss", facts({ walletSol: 2 }), true],
    ["pool_alertable", facts({ pool: pool({ blacklisted: true }) }), false],
    ["pool_alertable", facts({ pool: pool({ freezable: true }) }), false],
    ["pool_alertable", facts({ pool: pool({ binStep: 25 }) }), false],
    ["pool_alertable", facts({ pool: pool({ bothVerified: false }) }), false],
    ["pool_alertable", facts({ pool: null }), false],
    ["not_rebalance_managed", facts({ rebalanceManaged: true }), false],
    ["cooldown", facts({ lastExecutionAt: new Date(T0 - 300_000) }), true],
    ["cooldown", facts({ lastExecutionAt: new Date(T0 - 299_999) }), false],
    ["llm_budget", facts({ llmSpentUsd: 0.999 }), true],
    ["llm_budget", facts({ llmSpentUsd: 1 }), false],
  ] as const)("%s: case %#", (rule, f, ok) => {
    expect(verdict(rule, f)).toBe(ok);
  });

  test("a failing rule says why", () => {
    const pooled = checkOpen(g, BLUE_CHIP, facts({ pool: pool({ blacklisted: true }) }));
    expect(pooled.find((c) => c.rule === "pool_alertable")?.value).toBe("blacklisted");
    const wallet = checkOpen(g, BLUE_CHIP, facts({ walletSol: null }));
    expect(wallet.find((c) => c.rule === "position_size")?.value).toBe("wallet unread");
    const unquoted = checkOpen(g, BLUE_CHIP, facts({ params: params(1, null) }));
    expect(unquoted.find((c) => c.rule === "sol_reserve")?.value).toBe("setup cost not quoted");
  });

  test("pool_alertable reads the office's own filter, and an unknown organic score fails an organic bound", () => {
    const check = (filter: typeof BLUE_CHIP | null, p = pool()) =>
      checkOpen(g, filter, facts({ pool: p })).find((c) => c.rule === "pool_alertable");
    const midCap = pool({ tvl: 100_000, volume24h: 200_000, baseMcap: 20_000_000, binStep: 50, baseOrganic: 70 });
    expect(check(SCREENER_PRESETS["mid-cap"].filter, midCap)?.ok).toBe(true);
    expect(check(BLUE_CHIP, midCap)?.ok).toBe(false);
    expect(check(SCREENER_PRESETS["mid-cap"].filter, { ...midCap, baseOrganic: null })).toMatchObject({
      ok: false,
      value: "organic score unknown",
    });
    expect(check(null)).toMatchObject({ ok: false, value: "no pool filter" });
  });
});

describe("checkManage", () => {
  const manage = (o: Partial<ManageFacts> = {}): ManageFacts => ({
    kind: "rebalance",
    officePosition: true,
    walletSol: 1,
    positionRentSol: 0.06,
    setupSol: 0,
    book: { open: [], closedToday: [] },
    rebalanceManaged: false,
    lastExecutionAt: null,
    now: T0,
    ...o,
  });
  const ok = (f: ManageFacts) => checkManage(g, f).every((c) => c.ok);

  test("only the office's own positions, never an auto-rebalance pool", () => {
    expect(ok(manage())).toBe(true);
    expect(ok(manage({ officePosition: false }))).toBe(false);
    expect(ok(manage({ kind: "close", rebalanceManaged: true }))).toBe(false);
  });

  test("a rebalance or claim keeps the reserve and the cooldown; a close, the way out, does not", () => {
    const tight = { walletSol: 0.05, lastExecutionAt: new Date(T0 - 1000) };
    expect(ok(manage({ ...tight, kind: "rebalance" }))).toBe(false);
    expect(ok(manage({ ...tight, kind: "claim" }))).toBe(false);
    expect(ok(manage({ ...tight, kind: "close" }))).toBe(true);
    expect(ok(manage({ kind: "claim", walletSol: null }))).toBe(false);
  });

  test("a rebalance pays the rent of the bin arrays its new range creates, read on chain", () => {
    // 0.3 free - 0.1042 for two new arrays - 0.03 fee buffer = 0.1658 over the 0.1 reserve; 0.2 free is not enough.
    const arrays = { kind: "rebalance" as const, setupSol: 0.1042 };
    expect(ok(manage({ ...arrays, walletSol: 0.3 }))).toBe(true);
    expect(ok(manage({ ...arrays, walletSol: 0.2 }))).toBe(false);
    expect(ok(manage({ kind: "rebalance", setupSol: null }))).toBe(false);
    // A close never waits on a quote or a rent read.
    expect(ok(manage({ kind: "close", setupSol: null, positionRentSol: null, walletSol: null }))).toBe(true);
  });
});

describe("daily loss and budget", () => {
  test("the stored day-start capital counts only on its own UTC day", () => {
    const at = new Date(T0 - 60_000);
    expect(storedDayCapital({ dayCapitalSol: 3, dayCapitalAt: at }, T0)).toBe(3);
    expect(storedDayCapital({ dayCapitalSol: 3, dayCapitalAt: at }, T0 + 86_400_000)).toBeNull();
    expect(storedDayCapital({ dayCapitalSol: null, dayCapitalAt: null }, T0)).toBeNull();
  });

  test("PnL is realized today plus unrealized now, simulated positions count zero", () => {
    const book = {
      open: [position({ amountSol: 2, valueSol: 2.3 }), position({ amountSol: 5, simulated: true, valueSol: null })],
      closedToday: [position({ pnlSol: -0.1 }), position({ simulated: true })],
    };
    expect(dayPnlSol(book, T0)).toBeCloseTo(0.2);
    expect(dayPnlSol({ open: [position({ valueSol: null })], closedToday: [] }, T0)).toBeNull();
  });

  test("capital counts real positions at cost, free SOL takes simulated ones off with their rent and fees", () => {
    const ps = [position({ amountSol: 2 }), position({ amountSol: 3, simulated: true })];
    expect(officeCapital(5, ps)).toBe(7);
    expect(freeSol(5, ps, 0.09)).toBeCloseTo(1.91);
  });

  test("loss is measured against the day's starting capital and hits at the limit", () => {
    expect(dailyLossPct(10, -1)).toBeCloseTo(10);
    expect(dailyLossPct(10, 1)).toBe(0);
    expect(dailyLossPct(null, -1)).toBeNull();
    expect(dailyLossPct(10, null)).toBeNull();
    expect(dailyLossHit(g, dailyLossPct(10, -0.5))).toBe(true);
    expect(dailyLossHit(g, dailyLossPct(10, -0.49))).toBe(false);
    expect(dailyLossHit(g, null)).toBe(false);
  });

  test("the cap follows the key source", () => {
    expect(dailyCapUsd("vexis", 0.5, g)).toBe(0.5);
    expect(dailyCapUsd("own", 0.5, g)).toBe(1);
  });
});

describe("autopilot", () => {
  const limit = Guardrails.parse({ autopilotMaxSol: 0.5 });
  const open = (amountSol: number, setupSol: number | null) => ({
    kind: "open" as const,
    params: { strategy: "Curve", activeBin: 0, lowerBin: -5, upperBin: 5, amountSol, solUsd: 150, setupSol },
  });
  const verdict = (p: Parameters<typeof autopilotVerdict>[2], cost: number | null = null) =>
    autopilotVerdict("autopilot", limit, p, cost);

  test("an open counts its deposit plus its setup, approved at the limit and asked just over it", () => {
    expect(verdict(open(0.45, 0.05))).toEqual({ approve: true, nominalSol: 0.5 });
    expect(verdict(open(0.45, 0.0501)).approve).toBe(false);
  });

  test("approval mode never approves, whatever the size", () => {
    expect(autopilotVerdict("approval", limit, open(0.01, 0.01), null).approve).toBe(false);
  });

  test("a rebalance or close weighs the position at cost, a claim its fees", () => {
    const rebalance = { kind: "rebalance" as const, params: { strategy: "Spot", activeBin: 0, lowerBin: -3, upperBin: 3 } };
    expect(verdict(rebalance, 0.5).approve).toBe(true);
    expect(verdict({ kind: "close", params: { reason: "stop_loss" } }, 0.6)).toEqual({ approve: false, nominalSol: 0.6 });
    expect(verdict({ kind: "claim", params: { feeSol: 0.02 } }).approve).toBe(true);
  });

  test("an unknown amount asks the owner instead of counting as zero", () => {
    expect(verdict(open(0.1, null))).toEqual({ approve: false, nominalSol: null });
    expect(verdict({ kind: "claim", params: { feeSol: null } }).approve).toBe(false);
    expect(verdict({ kind: "close", params: { reason: "manual" } }, null).approve).toBe(false);
    expect(verdict({ kind: "open", params: { amountSol: 0.1 } }).approve).toBe(false);
  });
});
