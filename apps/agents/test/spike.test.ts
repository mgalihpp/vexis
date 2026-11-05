import { describe, expect, test } from "bun:test";
import { evaluateSpike, MAX_GAP_MS, type MinuteVolume, median, volumeDelta } from "../src/spike.ts";

const MIN = 60_000;
const T0 = Date.UTC(2026, 0, 1);
const config = { mult: 3, baseline: 5, minUsd: 1000 };

/** Consecutive minutes ending at `T0 + (n - 1) minutes`. */
function series(volumes: ReadonlyArray<number | null>): MinuteVolume[] {
  return volumes.map((volume, i) => ({ minute: T0 + i * MIN, volume }));
}
const nowFor = (rows: ReadonlyArray<MinuteVolume>) => (rows.at(-1)?.minute ?? 0) + 5_000;

describe("median", () => {
  test("odd and even counts", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });
});

describe("volumeDelta", () => {
  const prev = { minute: T0, cumulativeVolume: 100 };
  test("first reading has no delta", () => {
    expect(volumeDelta(undefined, { minute: T0, cumulativeVolume: 100 })).toBeNull();
  });
  test("consecutive minutes give the difference", () => {
    expect(volumeDelta(prev, { minute: T0 + MIN, cumulativeVolume: 160 })).toBe(60);
  });
  test("a gap over 1.5 minutes is unknown", () => {
    expect(volumeDelta(prev, { minute: T0 + MAX_GAP_MS, cumulativeVolume: 160 })).toBe(60);
    expect(volumeDelta(prev, { minute: T0 + 2 * MIN, cumulativeVolume: 160 })).toBeNull();
  });
  test("a cumulative reset is unknown, not negative", () => {
    expect(volumeDelta(prev, { minute: T0 + MIN, cumulativeVolume: 40 })).toBeNull();
  });
});

describe("evaluateSpike", () => {
  test("flags a spike over the median", () => {
    const rows = series([100, 120, 90, 110, 100, 5000]);
    expect(evaluateSpike(rows, config, nowFor(rows))).toEqual({ vol1m: 5000, baseline: 100, ratio: 50 });
  });

  test("warm-up: fewer valid readings than the baseline gives no verdict", () => {
    const rows = series([100, 120, 90, 110, 5000]);
    expect(evaluateSpike(rows, config, nowFor(rows))).toBeNull();
  });

  test("unknown (null) rows do not count towards the baseline", () => {
    const rows = series([100, null, 90, null, 110, 100, 5000]);
    expect(evaluateSpike(rows, config, nowFor(rows))).toBeNull();
    const enough = series([100, null, 90, 120, 110, 100, 5000]);
    expect(evaluateSpike(enough, config, nowFor(enough))?.baseline).toBe(100);
  });

  test("an unknown latest minute (gap or reset) never alerts", () => {
    const rows = series([100, 120, 90, 110, 100, null]);
    expect(evaluateSpike(rows, config, nowFor(rows))).toBeNull();
  });

  test("a stale latest reading never alerts", () => {
    const rows = series([100, 120, 90, 110, 100, 5000]);
    expect(evaluateSpike(rows, config, (rows.at(-1)?.minute ?? 0) + 10 * MIN)).toBeNull();
  });

  test("below minUsd is not a spike even at a huge ratio", () => {
    const rows = series([1, 1, 1, 1, 1, 900]);
    expect(evaluateSpike(rows, config, nowFor(rows))).toBeNull();
  });

  test("a zero median needs minUsd, then counts as an infinite ratio", () => {
    const quiet = series([0, 0, 0, 0, 0, 999]);
    expect(evaluateSpike(quiet, config, nowFor(quiet))).toBeNull();
    const burst = series([0, 0, 0, 0, 0, 1000]);
    expect(evaluateSpike(burst, config, nowFor(burst))).toEqual({
      vol1m: 1000,
      baseline: 0,
      ratio: Number.POSITIVE_INFINITY,
    });
  });

  test("below the multiplier is not a spike", () => {
    const rows = series([1000, 1000, 1000, 1000, 1000, 2999]);
    expect(evaluateSpike(rows, config, nowFor(rows))).toBeNull();
  });

  test("only the last `baseline` valid rows set the median", () => {
    const rows = series([9000, 9000, 9000, 100, 100, 100, 100, 100, 5000]);
    expect(evaluateSpike(rows, config, nowFor(rows))?.baseline).toBe(100);
  });
});
