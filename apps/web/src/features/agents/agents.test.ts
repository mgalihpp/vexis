import { describe, expect, test } from "bun:test";
import {
  agentName,
  agentStatus,
  compactUsd,
  configFields,
  DEFAULT_CONFIG,
  DEFAULT_REBALANCE_CONFIG,
  defaultDraft,
  describeFees,
  describeRule,
  draftIssues,
  LOW_SOL,
  MAX_POOLS,
  type PoolView,
  parseConfigFields,
  parseRebalanceFields,
  REBALANCE_FAILING,
  ratioText,
  rebalanceFields,
  ruleSummary,
  statusHint,
  summarizeFleet,
  TELEGRAM_NOT_LINKED,
  TELEGRAM_RELINK,
  type VolumeAgentView,
  WALLET_UNREADABLE,
} from "./agents";

const agent = (over: Partial<VolumeAgentView> = {}): VolumeAgentView => ({
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

  test("an auto-rebalance agent without a wallet needs attention until one is saved", () => {
    const rb = { enabled: true, paused: false, pausedReason: null, rpcHost: "rpc.test" };
    expect(agentStatus({ ...rb, wallet: null })).toBe("attention");
    expect(statusHint({ ...rb, wallet: null })).toContain("Waiting for a wallet");
    expect(agentStatus({ ...rb, wallet: "Pubkey111" })).toBe("live");
    expect(agentStatus({ ...rb, enabled: false, wallet: null })).toBe("off");
    expect(agentStatus({ ...rb, wallet: "Pubkey111", rpcHost: null })).toBe("attention");
    expect(statusHint({ ...rb, wallet: "Pubkey111", rpcHost: null })).toContain("Add an RPC URL");
  });

  test("low SOL needs attention and the hint asks for a top-up and a resume", () => {
    const low = { enabled: true, paused: true, pausedReason: LOW_SOL, wallet: "Pubkey111", rpcHost: "rpc.test" };
    expect(agentStatus(low)).toBe("attention");
    expect(statusHint(low)).toStartWith("Low SOL, top up then resume.");
  });

  test("a wallet key that no longer decrypts needs attention; repeated failed rebalances are a plain pause", () => {
    const unreadable = {
      enabled: true,
      paused: true,
      pausedReason: WALLET_UNREADABLE,
      wallet: "Pubkey111",
      rpcHost: "rpc.test",
    };
    expect(agentStatus(unreadable)).toBe("attention");
    expect(statusHint(unreadable)).toContain("Save the wallet again");
    const failing = { ...unreadable, pausedReason: REBALANCE_FAILING };
    expect(agentStatus(failing)).toBe("paused");
    expect(statusHint(failing)).toContain("3 failed rebalances in a row");
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

describe("rebalance form", () => {
  test("blank width keeps the current width; minutes become seconds; errors land on their field", () => {
    const config = { ...DEFAULT_REBALANCE_CONFIG, strategy: "Spot", slippageBps: 100, cooldownSec: 900 } as const;
    const fields = rebalanceFields(config);
    expect(fields).toEqual({
      strategy: "Spot",
      slippageBps: "100",
      halfWidth: "",
      cooldownMin: "15",
      dryRun: true,
      feeMode: "keep",
      feeClaimThresholdSol: "",
      solReserve: "0.1",
    });
    expect(parseRebalanceFields({ ...fields, halfWidth: "34", dryRun: false })).toEqual({
      ok: true,
      config: { ...config, halfWidth: 34, dryRun: false },
    });
    const bad = parseRebalanceFields({ ...fields, halfWidth: "0", cooldownMin: "", solReserve: "-1" });
    expect(bad.ok ? [] : Object.keys(bad.errors).sort()).toEqual(["cooldownMin", "halfWidth", "solReserve"]);
  });

  test("a claim threshold needs compound or sweep; blank means claim only on rebalance", () => {
    const fields = rebalanceFields(DEFAULT_REBALANCE_CONFIG);
    const kept = parseRebalanceFields({ ...fields, feeClaimThresholdSol: "0.05" });
    expect(kept.ok ? [] : Object.keys(kept.errors)).toEqual(["feeClaimThresholdSol"]);
    expect(parseRebalanceFields({ ...fields, feeMode: "sweep", feeClaimThresholdSol: "0.05" })).toMatchObject({
      ok: true,
      config: { feeMode: "sweep", feeClaimThresholdSol: 0.05 },
    });
    expect(parseRebalanceFields({ ...fields, feeMode: "compound" })).toMatchObject({
      ok: true,
      config: { feeMode: "compound", feeClaimThresholdSol: null },
    });
    expect(describeFees({ feeMode: "keep", feeClaimThresholdSol: null })).toBe("Keep in wallet");
    expect(describeFees({ feeMode: "compound", feeClaimThresholdSol: null })).toBe("Compound on rebalance");
    expect(describeFees({ feeMode: "sweep", feeClaimThresholdSol: 0.05 })).toBe("Sweep to SOL, claim at 0.05 SOL");
  });

  test("the fleet summary names each kind's rule", () => {
    expect(ruleSummary(agent()).map(([label]) => label)).toEqual(["Spike", "Baseline", "Min volume"]);
    const rb = {
      ...agent(),
      kind: "auto-rebalance" as const,
      wallet: null,
      rpcHost: null,
      config: DEFAULT_REBALANCE_CONFIG,
    };
    expect(ruleSummary(rb)).toEqual([
      ["Mode", "Preview"],
      ["Width", "Same width"],
      ["Fees", "Keep"],
    ]);
    expect(ruleSummary({ ...rb, config: { ...rb.config, dryRun: false } })[0]).toEqual(["Mode", "Live"]);
  });

  test("an auto-rebalance agent is named by its pool", () => {
    const named = (pool: Pick<PoolView, "label" | "tokens">) =>
      agentName({
        ...agent(),
        kind: "auto-rebalance",
        wallet: null,
        rpcHost: null,
        config: DEFAULT_REBALANCE_CONFIG,
        pools: [{ id: "1", address: "PoolAddr1111", lastAlertAt: null, ...pool }],
      });
    const jup = { symbol: "JUP", icon: null };
    const sol = { symbol: "SOL", icon: null };
    expect(named({ label: "SOL-USDC", tokens: null })).toBe("Auto-rebalance SOL-USDC");
    expect(named({ label: null, tokens: [jup, sol] })).toBe("Auto-rebalance JUP-SOL");
    expect(named({ label: null, tokens: null })).toBe("Auto-rebalance Pool…1111");
    expect(agentName(agent())).toBe("Volume spike");
  });
});

describe("wizard draft", () => {
  test("needs a pool and a valid rule", () => {
    expect(draftIssues(defaultDraft())).toEqual(["Pick at least one pool to watch"]);
    const withPool = { ...defaultDraft(), pools: [{ address: "P1", label: "SOL-USDC" }] };
    expect(draftIssues(withPool)).toEqual([]);
    expect(draftIssues({ ...withPool, fields: { ...withPool.fields, baseline: "1" } })).toHaveLength(1);
  });

  test("auto-rebalance needs one unmanaged pool, a valid rule, a saved wallet and its RPC", () => {
    const draft = { ...defaultDraft("auto-rebalance"), pools: [{ address: "P1", label: "SOL-USDC" }] };
    const ready = { wallet: "Pubkey111", rpcHost: "rpc.test" };
    expect(draftIssues(draft)).toEqual(["Save the wallet this agent manages"]);
    expect(draftIssues(draft, { wallet: "Pubkey111" })).toEqual(["Add the RPC URL the agent sends through"]);
    expect(draftIssues(draft, ready)).toEqual([]);
    const bad = { ...draft, rebalanceFields: { ...draft.rebalanceFields, slippageBps: "20000" } };
    expect(draftIssues(bad, ready)).toHaveLength(1);
    expect(draftIssues(draft, { ...ready, managed: new Set(["P1"]) })).toEqual([
      "Another auto-rebalance agent already manages this pool",
    ]);
    const two = { ...draft, pools: [...draft.pools, { address: "P2", label: "JUP-SOL" }] };
    expect(draftIssues(two, ready)).toEqual(["An auto-rebalance agent manages one pool"]);
    expect(draftIssues({ ...draft, pools: [] }, ready)).toEqual(["Pick the pool to manage"]);
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
