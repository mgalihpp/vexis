import { describe, expect, test } from "bun:test";
import {
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
  },
  walletSol: 10,
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

const params = (amountSol: number) => ({ ...facts().params, amountSol });
const verdict = (rule: string, f: RiskFacts) => checkOpen(g, BLUE_CHIP, f).find((c) => c.rule === rule)?.ok;

describe("checkOpen", () => {
  test("a sound proposal passes every rule", () => {
    expect(checkOpen(g, BLUE_CHIP, facts()).every((c) => c.ok)).toBe(true);
  });

  test.each([
    ["max_position_pct", facts({ params: params(2.5) }), true],
    ["max_position_pct", facts({ params: params(2.51) }), false],
    ["max_position_pct", facts({ walletSol: null }), false],
    // SOL locked in a real position still counts toward the base: 8 free + 2 committed = 10.
    ["max_position_pct", facts({ walletSol: 8, params: params(2.5), ...open(position({ amountSol: 2 })) }), true],
    ["sol_reserve", facts({ walletSol: 0.2, params: params(0.05) }), true],
    ["sol_reserve", facts({ walletSol: 0.12, params: params(0.03) }), false],
    // A simulated position never left the wallet, so it is taken off the free SOL.
    ["sol_reserve", facts({ params: params(0.05), ...open(position({ amountSol: 9.85, simulated: true })) }), true],
    ["sol_reserve", facts({ params: params(0.06), ...open(position({ amountSol: 9.85, simulated: true })) }), false],
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
    expect(wallet.find((c) => c.rule === "max_position_pct")?.value).toBe("wallet unread");
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

  test("capital counts real positions at cost, free SOL takes simulated ones off", () => {
    const ps = [position({ amountSol: 2 }), position({ amountSol: 3, simulated: true })];
    expect(officeCapital(5, ps)).toBe(7);
    expect(freeSol(5, ps)).toBe(2);
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
