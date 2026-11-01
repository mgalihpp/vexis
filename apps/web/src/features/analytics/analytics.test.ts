import { describe, expect, test } from "bun:test";
import {
  age,
  type Bar,
  type BinView,
  binDistribution,
  convertBars,
  feeMode,
  protocolFeePct,
  ratio,
  sumVolume,
  ticks,
} from "./analytics";

const bar = (t: number, low: number, high: number, close: number, volume: number): Bar => ({
  t,
  open: close,
  high,
  low,
  close,
  volume,
});

describe("convertBars", () => {
  const bars = [bar(0, 1, 2, 1.5, 100)];
  test("usd multiplies prices by the quote token price and keeps USD volume", () => {
    const [b] = convertBars(bars, "usd", 100);
    expect(b).toMatchObject({ low: 100, high: 200, close: 150, volume: 100 });
  });
  test("native keeps prices and divides volume by the quote token price", () => {
    const [b] = convertBars(bars, "native", 100);
    expect(b).toMatchObject({ low: 1, high: 2, close: 1.5, volume: 1 });
  });
  test("no quote price leaves the bars untouched", () => {
    expect(convertBars(bars, "native", 0)).toBe(bars);
  });
});

describe("binDistribution", () => {
  const bins: BinView[] = [-2, -1, 0, 1, 2].map((id) => ({
    id,
    price: 1 + id * 0.1,
    x: id > 0 ? 10 : 0,
    y: id < 0 ? 5 : 0,
  }));
  test("prices each side in USD and groups bins by count", () => {
    const d = binDistribution(bins, 0, 2, 2, 3, 5);
    expect(d).toHaveLength(5);
    expect(d[0]).toMatchObject({ yUsd: 15, xUsd: 0 });
    expect(d[4]).toMatchObject({ xUsd: 20, yUsd: 0 });
  });
  test("reach drops the far bins", () => {
    const d = binDistribution(bins, 0, 1, 1, 1, 11);
    expect(d.map((b) => b.from)).toEqual([0.9, 1, 1.1]);
  });
  test("no bins, no distribution", () => {
    expect(binDistribution([], 0, 5, 1, 1)).toEqual([]);
  });
});

test("ratio guards an empty denominator", () => {
  expect(ratio(5, 0)).toBe(0);
  expect(ratio(6, 3)).toBe(2);
});

test("sumVolume", () => {
  expect(sumVolume([{ volume: 1 }, { volume: 2.5 }])).toBe(3.5);
});

test("ticks run from the max down to the min", () => {
  expect(ticks(0, 100, 5)).toEqual([100, 75, 50, 25, 0]);
});

test("age", () => {
  const day = 86_400_000;
  expect(age(0, 5 * 3_600_000)).toBe("5h");
  expect(age(0, 12 * day)).toBe("12d");
  expect(age(0, 70 * day)).toBe("2mo 10d");
  expect(age(0, 400 * day)).toBe("1y 1mo");
});

test("fee mode and protocol fee", () => {
  expect(feeMode(0)).toBe("both");
  expect(feeMode(1)).toBe("quote");
  expect(protocolFeePct(0.25, 10)).toBeCloseTo(0.025);
});
