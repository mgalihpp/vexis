import { describe, expect, test } from "bun:test";
import { Guardrails } from "@vexis/db/office";
import { checkOpen, dailyCapUsd, dailyLossHit, dailyLossPct, type RiskFacts } from "../src/guardrails.ts";
import { OFFICE_FILTER } from "../src/pools.ts";
import { pool, T0 } from "./fakes.ts";

// Defaults: 25% max position, 3 positions, 5% daily loss, 0.1 SOL reserve, 300 s cooldown, $1 own-key budget.
const g = Guardrails.parse({});

const facts = (overrides: Partial<RiskFacts> = {}): RiskFacts => ({
  params: { strategy: "Spot", activeBin: 100, lowerBin: 90, upperBin: 110, amountSol: 1, solUsd: 150 },
  walletSol: 10,
  dayStartSol: 10,
  openPositions: 0,
  pool: pool(),
  rebalanceManaged: false,
  lastExecutionAt: null,
  now: T0,
  llmSpentUsd: 0,
  llmCapUsd: 1,
  ...overrides,
});

const params = (amountSol: number) => ({ ...facts().params, amountSol });
const verdict = (rule: string, f: RiskFacts) => checkOpen(g, OFFICE_FILTER, f).find((c) => c.rule === rule)?.ok;

describe("checkOpen", () => {
  test("a sound proposal passes every rule", () => {
    expect(checkOpen(g, OFFICE_FILTER, facts()).every((c) => c.ok)).toBe(true);
  });

  test.each([
    ["max_position_pct", facts({ params: params(2.5) }), true],
    ["max_position_pct", facts({ params: params(2.51) }), false],
    ["max_position_pct", facts({ walletSol: null }), false],
    ["sol_reserve", facts({ walletSol: 0.2, params: params(0.05), dayStartSol: 0.2 }), true],
    ["sol_reserve", facts({ walletSol: 0.12, params: params(0.03), dayStartSol: 0.12 }), false],
    ["max_active_positions", facts({ openPositions: 2 }), true],
    ["max_active_positions", facts({ openPositions: 3 }), false],
    ["daily_loss", facts({ walletSol: 9.51 }), true],
    ["daily_loss", facts({ walletSol: 9.5 }), false],
    ["daily_loss", facts({ dayStartSol: null }), false],
    ["daily_loss", facts({ walletSol: 12 }), true],
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
    const pooled = checkOpen(g, OFFICE_FILTER, facts({ pool: pool({ blacklisted: true }) }));
    expect(pooled.find((c) => c.rule === "pool_alertable")?.value).toBe("blacklisted");
    const wallet = checkOpen(g, OFFICE_FILTER, facts({ walletSol: null }));
    expect(wallet.find((c) => c.rule === "max_position_pct")?.value).toBe("wallet unread");
  });
});

describe("daily loss and budget", () => {
  test("loss is measured against the day's first balance and hits at the limit", () => {
    expect(dailyLossPct(10, 9)).toBeCloseTo(10);
    expect(dailyLossPct(10, 11)).toBe(0);
    expect(dailyLossPct(null, 9)).toBe(0);
    expect(dailyLossHit(g, 10, 9.5)).toBe(true);
    expect(dailyLossHit(g, 10, 9.51)).toBe(false);
  });

  test("the cap follows the key source", () => {
    expect(dailyCapUsd("vexis", 0.5, g)).toBe(0.5);
    expect(dailyCapUsd("own", 0.5, g)).toBe(1);
  });
});
