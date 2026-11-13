import { describe, expect, test } from "bun:test";
import { HISTORY_MINUTES, type History, recordMinute } from "../src/screener-history.ts";
import { MINUTE, T0 } from "./fakes.ts";

/** Records `minutes` (offsets from T0) with the given cumulative totals per pool. */
function replay(steps: [number, Record<string, number>][]): History {
  return steps.reduce<History>(
    (history, [m, totals]) =>
      recordMinute(
        history,
        Object.entries(totals).map(([address, cumulativeVolume]) => ({ address, cumulativeVolume })),
        T0 + m * MINUTE,
      ),
    new Map(),
  );
}

const volumes = (history: History, pool: string) => history.get(pool)?.minutes.map((m) => m.volume);

describe("screener history", () => {
  test("the first reading is unknown, the next is the delta, a gap or a drop is unknown", () => {
    const history = replay([
      [0, { A: 100 }],
      [1, { A: 150 }],
      [3, { A: 400 }],
      [4, { A: 300 }],
    ]);
    expect(volumes(history, "A")).toEqual([null, 50, null, null]);
  });

  test("a second reading in the same minute is ignored", () => {
    const history = replay([
      [0, { A: 100 }],
      [1, { A: 150 }],
      [1, { A: 900 }],
    ]);
    expect(volumes(history, "A")).toEqual([null, 50]);
  });

  test("keeps the newest minutes only, and drops a pool unseen for the whole buffer", () => {
    const steps = Array.from({ length: HISTORY_MINUTES + 5 }, (_, m): [number, Record<string, number>] => [
      m,
      m === 0 ? { A: 0, B: 0 } : { A: m * 10 },
    ]);
    const history = replay(steps);
    expect(history.get("A")?.minutes).toHaveLength(HISTORY_MINUTES);
    expect(history.has("B")).toBe(false);
    expect(replay(steps.slice(0, HISTORY_MINUTES)).has("B")).toBe(true);
  });
});
