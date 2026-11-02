import { describe, expect, test } from "bun:test";
import { diffWatch, EMPTY_SEEN, type NotifyPrefs, type Seen, volumeSpike, type WatchPosition } from "./notifications";

const WALLET = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const POOL = "BGm1tav58oGcsQJehL9WXBFXF7D27vZsKefj4xJKD5Y";
const prefs: NotifyPrefs = {
  outOfRange: true,
  positions: true,
  volumeSpike: true,
  spikeMultiplier: 3,
  spikeTimeframe: "1h",
  spikeMinUsd: 1000,
  currency: "usd",
  solPrice: null,
};

const pos = (address: string, inRange: boolean | null = true): WatchPosition => ({
  address,
  pool: POOL,
  pair: "SOL-USDC",
  inRange,
});
const seenAs = (inRange: boolean) => ({ pair: "SOL-USDC", inRange });
const poll = (positions: WatchPosition[] | null) => ({ wallets: [{ wallet: WALLET, positions }], pools: [] });
const hours = (volumes: number[]) => volumes.map((volume, i) => ({ t: i * 3_600_000, volume }));

describe("diffWatch positions", () => {
  test("the first poll of a wallet sets the baseline without notices", () => {
    const r = diffWatch(EMPTY_SEEN, poll([pos("a"), pos("b", false)]), prefs, {}, 1);
    expect(r.notices).toEqual([]);
    expect(r.seen.positions[WALLET]).toEqual({
      a: { pair: "SOL-USDC", inRange: true },
      b: { pair: "SOL-USDC", inRange: false },
    });
  });

  test("reports opened, closed and newly out-of-range positions", () => {
    const seen: Seen = { positions: { [WALLET]: { a: seenAs(true), b: seenAs(true), c: seenAs(false) } }, spikes: {} };
    const r = diffWatch(seen, poll([pos("a", false), pos("c", false), pos("d")]), prefs, {}, 1);
    expect(r.notices.map((n) => n.kind).sort()).toEqual(["closed", "opened", "out-of-range"]);
    expect(r.notices.find((n) => n.kind === "out-of-range")?.title).toBe("Out of range · SOL-USDC");
  });

  test("a position that stays out of range is reported once", () => {
    const seen: Seen = { positions: { [WALLET]: { a: seenAs(false) } }, spikes: {} };
    expect(diffWatch(seen, poll([pos("a", false)]), prefs, {}, 1).notices).toEqual([]);
  });

  test("a failed poll keeps the previous state and reports nothing", () => {
    const seen: Seen = { positions: { [WALLET]: { a: seenAs(true) } }, spikes: {} };
    const r = diffWatch(seen, poll(null), prefs, {}, 1);
    expect(r.notices).toEqual([]);
    expect(r.seen).toEqual(seen);
  });

  test("disabled kinds are not reported", () => {
    const seen: Seen = { positions: { [WALLET]: { a: seenAs(true), b: seenAs(true) } }, spikes: {} };
    const off = { ...prefs, outOfRange: false, positions: false };
    expect(diffWatch(seen, poll([pos("a", false), pos("c")]), off, {}, 1).notices).toEqual([]);
  });
});

describe("volumeSpike", () => {
  test("flags a candle at the multiplier over the average", () => {
    const spike = volumeSpike(hours([...Array(24).fill(1000), 3000]), 3, 1000);
    expect(spike).toEqual({ t: 24 * 3_600_000, volume: 3000, average: 1000 });
    expect(volumeSpike(hours([...Array(24).fill(1000), 2999]), 3, 1000)).toBeNull();
  });

  test("ignores candles under the minimum, dead pools and short history", () => {
    expect(volumeSpike(hours([...Array(24).fill(100), 900]), 3, 1000)).toBeNull();
    expect(volumeSpike(hours([...Array(24).fill(100), 900]), 3, 500)).not.toBeNull();
    expect(volumeSpike(hours([...Array(24).fill(0), 50_000]), 3, 1000)).toBeNull();
    expect(volumeSpike(hours([1000, 1000, 9000]), 3, 1000)).toBeNull();
  });

  const watch = { wallets: [], pools: [{ pool: POOL, bars: hours([...Array(24).fill(1000), 5000]) }] };

  test("diffWatch reports a spike once per candle", () => {
    const first = diffWatch(EMPTY_SEEN, watch, prefs, { [POOL]: "SOL-USDC 10" }, 1);
    expect(first.notices.map((n) => n.title)).toEqual(["Volume spike · SOL-USDC 10"]);
    expect(first.notices[0]?.body).toBe("$5K in the current 1h candle, 5.0× the average");
    expect(diffWatch(first.seen, watch, prefs, {}, 2).notices).toEqual([]);
  });

  test("a SOL minimum shows the amount in SOL and needs a SOL price", () => {
    const sol = { ...prefs, currency: "sol" as const, solPrice: 100 };
    expect(diffWatch(EMPTY_SEEN, watch, sol, {}, 1).notices[0]?.body).toBe(
      "50 SOL in the current 1h candle, 5.0× the average",
    );
    expect(diffWatch(EMPTY_SEEN, watch, { ...sol, spikeMinUsd: null }, {}, 1).notices).toEqual([]);
  });
});
