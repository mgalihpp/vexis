import { describe, expect, test } from "bun:test";
import {
  type AgentView,
  agentStatus,
  compactUsd,
  configFields,
  DEFAULT_CONFIG,
  defaultDraft,
  describeRule,
  draftIssues,
  MAX_POOLS,
  parseConfigFields,
  ratioText,
  statusHint,
  summarizeFleet,
  TELEGRAM_NOT_LINKED,
  TELEGRAM_RELINK,
} from "./agents";

const agent = (over: Partial<AgentView> = {}): AgentView => ({
  id: "a1",
  kind: "volume-watch",
  enabled: true,
  paused: false,
  pausedReason: null,
  config: DEFAULT_CONFIG,
  pools: [],
  alerts24h: 0,
  lastAlertAt: null,
  ...over,
});

describe("status", () => {
  test("off beats everything, a runner pause for Telegram needs attention, a manual pause is just paused", () => {
    expect(agentStatus(agent())).toBe("live");
    expect(agentStatus(agent({ paused: true }))).toBe("paused");
    expect(agentStatus(agent({ paused: true, pausedReason: TELEGRAM_NOT_LINKED }))).toBe("attention");
    expect(agentStatus(agent({ enabled: false, paused: true, pausedReason: TELEGRAM_NOT_LINKED }))).toBe("off");
  });

  test("an unreadable bot token needs attention and the hint asks for a re-link", () => {
    const relink = agent({ paused: true, pausedReason: TELEGRAM_RELINK });
    expect(agentStatus(relink)).toBe("attention");
    expect(statusHint(relink)).toContain("Connect your bot again");
    expect(statusHint(agent({ paused: true, pausedReason: TELEGRAM_NOT_LINKED }))).toContain("no Telegram chat");
    expect(statusHint(agent())).toBeUndefined();
  });
});

describe("config form", () => {
  test("defaults round-trip through the form text", () => {
    const result = parseConfigFields(configFields(DEFAULT_CONFIG));
    expect(result).toEqual({ ok: true, config: DEFAULT_CONFIG });
    expect(configFields(DEFAULT_CONFIG).cooldownMin).toBe("5");
  });

  test("minutes become seconds and unchanged fields keep their value", () => {
    const current = { ...DEFAULT_CONFIG, intervalSec: 120 };
    const result = parseConfigFields({ ...configFields(current), cooldownMin: "10", mult: "2.5" }, current);
    expect(result).toMatchObject({ ok: true, config: { cooldownSec: 600, mult: 2.5, intervalSec: 120 } });
  });

  test("invalid values come back as per-field errors", () => {
    const result = parseConfigFields({ mult: "0", baseline: "2", minUsd: "-1", cooldownMin: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(["baseline", "cooldownMin", "minUsd", "mult"]);
  });

  test("describes the rule in one line", () => {
    expect(describeRule(DEFAULT_CONFIG)).toBe(
      "≥ 3× the median of the last 30 minutes, at least $5,000 in a minute, then quiet for 5 min",
    );
  });
});

describe("wizard draft", () => {
  test("needs a pool and a valid rule", () => {
    expect(draftIssues(defaultDraft())).toEqual(["Pick at least one pool to watch"]);
    const withPool = { ...defaultDraft(), pools: [{ address: "P1", label: "SOL-USDC" }] };
    expect(draftIssues(withPool)).toEqual([]);
    expect(draftIssues({ ...withPool, fields: { ...withPool.fields, baseline: "1" } })).toHaveLength(1);
  });

  test("caps the number of pools", () => {
    const pools = Array.from({ length: MAX_POOLS + 1 }, (_, i) => ({ address: `P${i}`, label: `P${i}` }));
    expect(draftIssues({ ...defaultDraft(), pools })).toContain(`Watch at most ${MAX_POOLS} pools`);
  });
});

describe("fleet", () => {
  test("summarizes watching, attention, pools and alerts", () => {
    const s = summarizeFleet([
      agent({ pools: [{ id: "1", address: "A", label: null, lastAlertAt: null, tokens: null }], alerts24h: 3 }),
      agent({ id: "a2", paused: true, pausedReason: TELEGRAM_NOT_LINKED, alerts24h: 1 }),
    ]);
    expect(s).toEqual({ total: 2, live: 1, attention: 1, pools: 1, alerts24h: 4 });
    expect(summarizeFleet([])).toEqual({ total: 0, live: 0, attention: 0, pools: 0, alerts24h: 0 });
  });

  test("formats volume and ratios", () => {
    expect(compactUsd(850)).toBe("$850");
    expect(compactUsd(18_400)).toBe("$18.4k");
    expect(compactUsd(1_200_000)).toBe("$1.2M");
    expect(ratioText(6.24)).toBe("6.2×");
    expect(ratioText(1_000_000)).toBe("from zero");
  });
});
