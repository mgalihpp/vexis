import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PositionEvent } from "./portfolio";
import {
  collectHistories,
  type HistoryCache,
  type HistoryRef,
  historyQueue,
  readHistoryCache,
  writeHistoryCache,
} from "./transaction-history.server";

const WALLET = "81gDB9FDGqLLiCVhNMXBAk9NotKNe2MRECSm8Ck7koGa";

const open = (position: string, openedAt: number | null): HistoryRef => ({
  position,
  pool: "pool",
  openedAt,
  closedAt: null,
});
const closed = (position: string, closedAt: number): HistoryRef => ({
  position,
  pool: "pool",
  openedAt: closedAt - 10,
  closedAt,
});
const event = (signature: string, at: number): PositionEvent => ({
  id: `${signature}:0:add`,
  signature,
  type: "add",
  at,
  amountX: 1,
  amountY: 2,
  amountXUsd: 3,
  amountYUsd: 4,
  totalUsd: 7,
});

const ids = (refs: HistoryRef[]) => refs.map((r) => r.position);

describe("history fetch order", () => {
  const active = [open("a-old", 100), open("a-new", 300), open("a-unknown", null)];
  const done = [closed("c-mid", 200), closed("c-new", 500), closed("c-old", 50)];

  test("active positions come first, newest opened first, then closed by latest close", () => {
    expect(ids(historyQueue(active, done, new Map(), new Set()))).toEqual([
      "a-new",
      "a-old",
      "a-unknown",
      "c-new",
      "c-mid",
      "c-old",
    ]);
  });

  test("cached closed positions are skipped but active positions are always refetched", () => {
    const cache: HistoryCache = new Map([
      ["c-new", []],
      ["a-new", [event("s", 1)]],
    ]);
    expect(ids(historyQueue(active, done, cache, new Set()))).toEqual([
      "a-new",
      "a-old",
      "a-unknown",
      "c-mid",
      "c-old",
    ]);
  });

  test("positions this job already tried are not queued again", () => {
    expect(ids(historyQueue(active, done, new Map(), new Set(["a-new", "c-mid"])))).toEqual([
      "a-old",
      "a-unknown",
      "c-new",
      "c-old",
    ]);
  });

  test("a position listed as both active and closed is treated as closed", () => {
    expect(ids(historyQueue([open("p", 1)], [closed("p", 2)], new Map(), new Set()))).toEqual(["p"]);
    expect(historyQueue([open("p", 1)], [closed("p", 2)], new Map([["p", []]]), new Set())).toEqual([]);
  });
});

describe("history progress", () => {
  test("counts only fetched positions as loaded, out of every known position", () => {
    const activeEvents = new Map([["a1", [event("x", 1)]]]);
    const cache: HistoryCache = new Map([
      ["c1", [event("y", 2)]],
      ["c-gone", [event("z", 3)]],
    ]);
    const { histories, total } = collectHistories(
      [open("a1", 1), open("a2", 2)],
      [closed("c1", 5), closed("c2", 6)],
      activeEvents,
      cache,
    );
    expect(total).toBe(4);
    expect(histories).toEqual([
      { ...open("a1", 1), events: [event("x", 1)] },
      { ...closed("c1", 5), events: [event("y", 2)] },
    ]);
  });

  test("a position that closed uses its closed history, counted once", () => {
    const { histories, total } = collectHistories(
      [open("p", 1)],
      [closed("p", 9)],
      new Map([["p", [event("stale", 1)]]]),
      new Map([["p", [event("final", 2)]]]),
    );
    expect(total).toBe(1);
    expect(histories).toEqual([{ ...closed("p", 9), events: [event("final", 2)] }]);
  });

  test("an empty position history still counts as loaded", () => {
    const { histories, total } = collectHistories([], [closed("c", 1)], new Map(), new Map([["c", []]]));
    expect({ loaded: histories.length, total }).toEqual({ loaded: 1, total: 1 });
  });
});

describe("history cache file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vexis-history-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  test("round trips through disk and leaves no temp file behind", async () => {
    const cache: HistoryCache = new Map([
      ["p1", [event("a", 1), event("b", 2)]],
      ["p2", []],
    ]);
    await writeHistoryCache(dir, WALLET, cache);
    expect(await readHistoryCache(dir, WALLET)).toEqual(cache);
    expect(await readdir(dir)).toEqual([`${WALLET}.history.json`]);
  });

  test("does not overwrite the closed-pool cache file", async () => {
    await writeFile(join(dir, `${WALLET}.json`), "pools");
    await writeHistoryCache(dir, WALLET, new Map([["p", []]]));
    expect((await readdir(dir)).sort()).toEqual([`${WALLET}.history.json`, `${WALLET}.json`]);
  });

  test("a later write replaces the earlier file", async () => {
    await writeHistoryCache(dir, WALLET, new Map([["p1", []]]));
    const next: HistoryCache = new Map([["p2", [event("c", 3)]]]);
    await writeHistoryCache(dir, WALLET, next);
    expect(await readHistoryCache(dir, WALLET)).toEqual(next);
  });

  test("creates the cache directory when it is missing", async () => {
    const nested = join(dir, "nested", "cache");
    await writeHistoryCache(nested, WALLET, new Map([["p", []]]));
    expect((await readHistoryCache(nested, WALLET)).size).toBe(1);
  });

  test("a missing file reads as an empty cache", async () => {
    expect((await readHistoryCache(dir, WALLET)).size).toBe(0);
  });

  test.each([
    ["truncated JSON", '{"version":1,"positions":{"p":['],
    ["another version", JSON.stringify({ version: 2, positions: { p: [] } })],
    ["a malformed event", JSON.stringify({ version: 1, positions: { p: [{ signature: "s" }] } })],
  ])("%s reads as an empty cache", async (_, contents) => {
    await writeFile(join(dir, `${WALLET}.history.json`), contents);
    expect((await readHistoryCache(dir, WALLET)).size).toBe(0);
  });
});
