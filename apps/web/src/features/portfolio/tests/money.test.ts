import { describe, expect, test } from "bun:test";
import { compactSol, compactUsd, formatAmount, money, pct, tone } from "../money";

describe("money", () => {
  test.each([
    [18.0254, "sol", {}, "18.0254 SOL"],
    [0.42, "sol", { signed: true }, "+0.4200 SOL"],
    [-12.3, "usd", {}, "-$12.30"],
    [-12.3, "usd", { signed: true }, "-$12.30"],
    [1234.5, "usd", {}, "$1,234.50"],
    [0, "usd", { signed: true }, "+$0.00"],
    [-0, "usd", {}, "-$0.00"],
    [1.23456, "sol", { digits: 2 }, "1.23 SOL"],
  ] as const)("%p %s %p -> %s", (value, currency, opts, expected) => {
    expect(money(value, currency, opts)).toBe(expected);
  });

  test("pct and tone", () => {
    expect(pct(0.1234)).toBe("12.34%");
    expect(pct(-0.5, 0)).toBe("-50%");
    expect([5, -5, 0].map(tone)).toEqual(["text-profit", "text-loss", "text-muted-foreground"]);
  });
});

describe("compact amounts", () => {
  test.each([
    [950.12, "$950.12", "950.12 SOL"],
    [114_200, "$114.20K", "114.20K SOL"],
    [1_270_000, "$1.27M", "1.27M SOL"],
    [2_500_000_000, "$2.50B", "2.50B SOL"],
    [-1500, "-$1.50K", "-1.50K SOL"],
  ])("%p", (value, usd, sol) => {
    expect(compactUsd(value)).toBe(usd);
    expect(compactSol(value)).toBe(sol);
  });
});

test("token amounts keep three decimals from 1 up and three significant digits below", () => {
  expect(formatAmount(1234.5678)).toBe("1,234.568");
  expect(formatAmount(0.000543)).toBe("0.000543");
});
