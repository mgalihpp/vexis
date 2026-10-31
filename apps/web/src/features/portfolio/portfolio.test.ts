import { describe, expect, test } from "bun:test";
import {
  type ClosedPosition,
  cumulative,
  dailyBuckets,
  inRange,
  monthCalendar,
  resolveRange,
  series,
  summarize,
} from "./portfolio";

const at = (iso: string) => Date.parse(iso);

const pos = (closedAt: string, pnl: number, fees = 0): ClosedPosition => {
  const amounts = { deposit: 10, withdraw: 10 + pnl, fees, pnl };
  return {
    address: `p${closedAt}${pnl}`,
    pool: "pool",
    pair: "SOL-USDC",
    openedAt: at(closedAt) - 3_600_000,
    closedAt: at(closedAt),
    sol: amounts,
    usd: { ...amounts, pnl: pnl * 100 },
  };
};

describe("resolveRange", () => {
  // Saturday 2026-10-31 15:00 UTC
  const now = at("2026-10-31T15:00:00Z");

  test("week presets start on Sunday and end at tomorrow's midnight", () => {
    expect(resolveRange("this-week", now)).toEqual({ from: at("2026-10-25"), to: at("2026-11-01") });
    expect(resolveRange("last-week", now)).toEqual({ from: at("2026-10-18"), to: at("2026-10-25") });
  });

  test("month, quarter, and year presets cross boundaries correctly", () => {
    expect(resolveRange("last-month", now)).toEqual({ from: at("2026-09-01"), to: at("2026-10-01") });
    expect(resolveRange("qtd", now)).toEqual({ from: at("2026-10-01"), to: at("2026-11-01") });
    expect(resolveRange("last-year", now)).toEqual({ from: at("2025-01-01"), to: at("2026-01-01") });
    expect(resolveRange("last-7", now)).toEqual({ from: at("2026-10-25"), to: at("2026-11-01") });
  });

  test("custom passes through and inRange treats `to` as exclusive", () => {
    const range = resolveRange("custom", now, { from: at("2026-10-02"), to: at("2026-10-03") });
    const kept = inRange(
      [pos("2026-10-01T23:59:59Z", 1), pos("2026-10-02T12:00:00Z", 2), pos("2026-10-03T00:00:00Z", 3)],
      range,
    );
    expect(kept.map((p) => p.sol.pnl)).toEqual([2]);
  });
});

test("summarize counts break-even as a loss and derives ratios from gross sums", () => {
  const stats = summarize(
    [
      pos("2026-10-01T01:00:00Z", 3),
      pos("2026-10-01T02:00:00Z", -1),
      pos("2026-10-02T01:00:00Z", 0),
      pos("2026-10-03T01:00:00Z", 1),
    ],
    "sol",
  );
  expect(stats).toMatchObject({
    count: 4,
    net: 3,
    wins: 2,
    losses: 2,
    grossProfit: 4,
    grossLoss: 1,
    profitFactor: 4,
    avgWin: 2,
    avgLoss: 0.5,
    winLossRatio: 4,
    dayWins: 2,
    dayLosses: 1,
    avgInvested: 10,
  });
  expect(summarize([pos("2026-10-01T01:00:00Z", 2)], "sol").profitFactor).toBeNull();
  expect(summarize([pos("2026-10-01T01:00:00Z", 2)], "usd").net).toBe(200);
});

test("daily buckets split on UTC midnight and series fills gaps", () => {
  const days = dailyBuckets(
    [pos("2026-10-01T23:59:00Z", 1), pos("2026-10-02T00:01:00Z", 2), pos("2026-10-04T10:00:00Z", -1)],
    "sol",
    "pnl",
  );
  expect(days.map((b) => [b.start, b.value])).toEqual([
    [at("2026-10-01"), 1],
    [at("2026-10-02"), 2],
    [at("2026-10-04"), -1],
  ]);
  expect(series(days, "daily").map((b) => b.value)).toEqual([1, 2, 0, -1]);
  expect(cumulative(days).map((b) => b.value)).toEqual([1, 3, 3, 2]);
  expect(series(days, "monthly")).toEqual([{ start: at("2026-10-01"), value: 2, positions: 3, wins: 2 }]);
  expect(dailyBuckets([pos("2026-10-01T01:00:00Z", -1, 0.25)], "sol", "fees")[0]?.value).toBe(0.25);
});

test("month calendar counts spill-over days in week totals but not in the month", () => {
  const days = dailyBuckets(
    [pos("2026-09-27T12:00:00Z", 0.12), pos("2026-10-01T12:00:00Z", 0.5), pos("2026-10-31T12:00:00Z", 1)],
    "sol",
    "pnl",
  );
  const cal = monthCalendar(days, 2026, 9);
  expect(cal.weeks).toHaveLength(5);
  expect(cal.weeks[0]?.cells[0]).toMatchObject({ day: 27, inMonth: false });
  expect(cal.weeks[0]?.total).toBeCloseTo(0.62);
  expect(cal.weeks[0]?.activeDays).toBe(2);
  expect(cal.total).toBeCloseTo(1.5);
  expect(cal.activeDays).toBe(2);
  expect(cal.weeks[4]?.cells[6]?.date).toBe(at("2026-10-31"));
});
