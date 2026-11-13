import { describe, expect, test } from "bun:test";
import {
  alertable,
  type FilterPool,
  type FilterToken,
  filterPool,
  type PoolFilter,
  type PresetId,
  SCREENER_BASELINE,
  SCREENER_PRESETS,
  screenRule,
} from "./screen.ts";

const SOL = "So11111111111111111111111111111111111111112";

const token = (over: Partial<FilterToken> = {}): FilterToken => ({
  mint: "TOKEN",
  verified: true,
  freezable: false,
  marketCap: 500_000_000,
  organic: 90,
  ...over,
});

/** A verified $500M token against SOL at bin step 10, deep and busy enough for every preset's floor. */
const pool = (over: Partial<FilterPool> = {}): FilterPool => ({
  tvl: 1_000_000,
  volume24h: 1_000_000,
  binStep: 10,
  blacklisted: false,
  baseMcap: 500_000_000,
  bothVerified: true,
  baseOrganic: 90,
  freezable: false,
  ...over,
});

describe("filterPool", () => {
  test("reads the non-quote side whichever slot it is in; a quote is never freezable", () => {
    const sol = token({ mint: SOL, marketCap: 80_000_000_000, organic: 99, freezable: true });
    const base = token({ marketCap: 2_000_000, organic: 40 });
    const raw = { tvl: 1, volume24h: 2, binStep: 80, blacklisted: false };
    expect(filterPool({ ...raw, tokenX: sol, tokenY: base })).toMatchObject({
      baseMcap: 2_000_000,
      baseOrganic: 40,
      freezable: false,
    });
    expect(filterPool({ ...raw, tokenX: base, tokenY: sol })).toMatchObject({ baseMcap: 2_000_000 });
    expect(filterPool({ ...raw, tokenX: token({ freezable: true }), tokenY: sol }).freezable).toBe(true);
    expect(filterPool({ ...raw, tokenX: token({ verified: false }), tokenY: sol }).bothVerified).toBe(false);
  });
});

describe("alertable", () => {
  const custom: PoolFilter = {
    minTvl: 0,
    minVolume: 0,
    minMcap: 0,
    maxMcap: 0,
    minStep: 0,
    maxStep: null,
    verified: false,
    minOrganic: 0,
  };

  test.each([
    ["an open filter takes a plain pool", pool(), custom, true],
    ["blacklisted is always dropped", pool({ blacklisted: true }), custom, false],
    ["a freezable token is always dropped", pool({ freezable: true }), custom, false],
    ["verified asks for both tokens", pool({ bothVerified: false }), { ...custom, verified: true }, false],
    ["unknown organic fails an organic bound", pool({ baseOrganic: null }), { ...custom, minOrganic: 50 }, false],
    ["unknown organic passes when there is no bound", pool({ baseOrganic: null }), custom, true],
    ["unknown market cap fails a cap bound", pool({ baseMcap: null }), { ...custom, maxMcap: 1_000_000 }, false],
    ["max step is inclusive", pool({ binStep: 80 }), { ...custom, minStep: 25, maxStep: 80 }, true],
    ["above max step fails", pool({ binStep: 100 }), { ...custom, maxStep: 80 }, false],
  ])("%s", (_, p, f, expected) => {
    expect(alertable(p, f)).toBe(expected);
  });

  test.each<[PresetId, FilterPool, boolean]>([
    ["blue-chip", pool(), true],
    ["blue-chip", pool({ binStep: 25 }), false],
    ["blue-chip", pool({ baseMcap: 50_000_000 }), false],
    ["mid-cap", pool({ binStep: 50, baseMcap: 20_000_000, tvl: 30_000, volume24h: 60_000 }), true],
    ["mid-cap", pool({ binStep: 50, baseMcap: 20_000_000, baseOrganic: 30 }), false],
    ["mid-cap", pool({ binStep: 50, baseMcap: 20_000_000, bothVerified: false }), false],
    ["degen", pool({ binStep: 100, baseMcap: 2_000_000, bothVerified: false, baseOrganic: null }), true],
    ["degen", pool({ binStep: 100, baseMcap: 50_000_000 }), false],
    ["degen", pool({ binStep: 100, baseMcap: 2_000_000, tvl: 5_000 }), false],
  ])("%s on %o is %p", (id, p, expected) => {
    expect(alertable(p, SCREENER_PRESETS[id].filter)).toBe(expected);
  });
});

describe("screenRule", () => {
  test("a preset reads the table, custom reads the config, both on the fixed baseline", () => {
    const own = { mult: 7, minUsd: 123 };
    const filter = { ...SCREENER_PRESETS.degen.filter, minTvl: 42 };
    expect(screenRule({ ...own, preset: "blue-chip", custom: filter })).toEqual({
      filter: SCREENER_PRESETS["blue-chip"].filter,
      mult: 3,
      minUsd: 25_000,
      baseline: SCREENER_BASELINE,
    });
    expect(screenRule({ ...own, preset: "custom", custom: filter })).toEqual({
      filter,
      mult: 7,
      minUsd: 123,
      baseline: SCREENER_BASELINE,
    });
    expect(screenRule({ ...own, preset: "custom", custom: null })).toBeNull();
  });
});
