import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freshCount, type PoolCache, readPoolCache, stalePools, writePoolCache } from "./closed-history.server";
import type { ClosedPosition } from "./portfolio";

const WALLET = "81gDB9FDGqLLiCVhNMXBAk9NotKNe2MRECSm8Ck7koGa";

const position = (pool: string, closedAt: number): ClosedPosition => ({
  address: `${pool}-pos-${closedAt}`,
  pool,
  pair: "SOL-USDC",
  openedAt: closedAt - 1000,
  closedAt,
  sol: { deposit: 1, withdraw: 1.1, fees: 0.05, pnl: 0.15 },
  usd: { deposit: 150, withdraw: 165, fees: 7.5, pnl: 22.5 },
});

describe("stale closed pools", () => {
  const pools = [
    { pool: "a", lastClosedAt: 100 },
    { pool: "b", lastClosedAt: 300 },
    { pool: "c", lastClosedAt: 200 },
    { pool: "d", lastClosedAt: null },
  ];

  test("an empty cache makes every pool stale, newest close first", () => {
    expect(stalePools(pools, new Map()).map((p) => p.pool)).toEqual(["b", "c", "a", "d"]);
    expect(freshCount(pools, new Map())).toBe(0);
  });

  test("a pool is fresh only when its cached lastClosedAt matches", () => {
    const cache: PoolCache = new Map([
      ["a", { lastClosedAt: 100, positions: [position("a", 100)] }],
      ["b", { lastClosedAt: 250, positions: [position("b", 250)] }],
      ["d", { lastClosedAt: null, positions: [] }],
    ]);
    expect(stalePools(pools, cache).map((p) => p.pool)).toEqual(["b", "c"]);
    expect(freshCount(pools, cache)).toBe(2);
  });

  test("cache entries for pools no longer listed do not count as loaded", () => {
    const cache: PoolCache = new Map([["gone", { lastClosedAt: 1, positions: [] }]]);
    expect(freshCount(pools, cache)).toBe(0);
  });
});

describe("pool cache file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vexis-cache-"));
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  test("round trips through disk and leaves no temp file behind", async () => {
    const cache: PoolCache = new Map([
      ["a", { lastClosedAt: 100, positions: [position("a", 100), position("a", 90)] }],
      ["b", { lastClosedAt: null, positions: [] }],
    ]);
    await writePoolCache(dir, WALLET, cache);
    expect(await readPoolCache(dir, WALLET)).toEqual(cache);
    expect(await readdir(dir)).toEqual([`${WALLET}.json`]);
  });

  test("a later write replaces the earlier file", async () => {
    await writePoolCache(dir, WALLET, new Map([["a", { lastClosedAt: 1, positions: [] }]]));
    const next: PoolCache = new Map([["b", { lastClosedAt: 2, positions: [position("b", 2)] }]]);
    await writePoolCache(dir, WALLET, next);
    expect(await readPoolCache(dir, WALLET)).toEqual(next);
  });

  test("creates the cache directory when it is missing", async () => {
    const nested = join(dir, "nested", "cache");
    await writePoolCache(nested, WALLET, new Map([["a", { lastClosedAt: 1, positions: [] }]]));
    expect((await readPoolCache(nested, WALLET)).size).toBe(1);
  });

  test("a missing file reads as an empty cache", async () => {
    expect((await readPoolCache(dir, WALLET)).size).toBe(0);
  });

  test.each([
    ["truncated JSON", '{"version":1,"pools":{"a":'],
    ["another version", JSON.stringify({ version: 2, pools: { a: { lastClosedAt: 1, positions: [] } } })],
    ["a malformed position", JSON.stringify({ version: 1, pools: { a: { lastClosedAt: 1, positions: [{}] } } })],
  ])("%s reads as an empty cache", async (_, contents) => {
    await writeFile(join(dir, `${WALLET}.json`), contents);
    expect((await readPoolCache(dir, WALLET)).size).toBe(0);
  });
});
