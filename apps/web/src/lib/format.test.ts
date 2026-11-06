import { describe, expect, test } from "bun:test";
import { ago } from "./format";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("ago", () => {
  test.each([
    [0, "0s ago"],
    [42_000, "42s ago"],
    [MIN, "1m ago"],
    [59 * MIN + 30_000, "59m ago"],
    [HOUR, "1h ago"],
    [23 * HOUR + 59 * MIN, "23h ago"],
    [DAY, "1d ago"],
    [32 * HOUR, "1d 8h ago"],
    [33 * HOUR + 20 * MIN, "1d 9h ago"],
    [48 * HOUR, "2d ago"],
    [-5_000, "0s ago"],
  ])("%p ms -> %p", (ms, expected) => {
    expect(ago(ms)).toBe(expected);
  });
});
