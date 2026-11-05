import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import type { AppConfig } from "../src/AppConfig.ts";
import { cycle } from "../src/Cycle.ts";
import type { Db } from "../src/Db.ts";
import { formatMessage, formatUsd, linkButtons, type SpikeLine } from "../src/format.ts";
import { prune, RETENTION_MS } from "../src/Ingest.ts";
import type { Meteora } from "../src/Meteora.ts";
import type { Telegram } from "../src/Telegram.ts";
import {
  fakeDb,
  fakeMeteora,
  fakeTelegram,
  MINUTE,
  quietHistory,
  reading,
  runAt,
  T0,
  testConfig,
  watch,
} from "./fakes.ts";

/** Fresh fakes wired together; `cycle` runs against them at `at`. */
function setup(options: { watches?: ReturnType<typeof watch>[] } = {}) {
  const db = fakeDb({ watches: options.watches ?? [watch()] });
  const meteora = fakeMeteora();
  const telegram = fakeTelegram();
  const layer = Layer.mergeAll(db.layer, meteora.layer, telegram.layer, testConfig);
  const run = <A, E>(effect: Effect.Effect<A, E, AppConfig | Db | Meteora | Telegram>, at = T0) =>
    runAt(effect.pipe(Effect.provide(layer)), at);
  return { db: db.state, meteora: meteora.state, telegram: telegram.state, run };
}

/** History of 10 quiet minutes at $100, then a minute with `volume` USD more than the last total. */
function spikeScenario(volume: number, extra: { watches?: ReturnType<typeof watch>[] } = {}) {
  const s = setup(extra);
  s.db.minutes.set("POOL1", quietHistory("POOL1", 10));
  s.db.chats.set("user-1", 42n);
  const last = s.db.minutes.get("POOL1")?.at(-1)?.cumulativeVolume ?? 0;
  s.meteora.readings = [reading({ cumulativeVolume: last + volume })];
  return s;
}

describe("ingest", () => {
  test("first reading of a pool stores a null volume", async () => {
    const s = setup();
    s.meteora.readings = [reading({ cumulativeVolume: 500 })];
    await s.run(cycle());
    expect(s.db.minutes.get("POOL1")).toMatchObject([{ cumulativeVolume: 500, volume: null, tvl: 1_000_000 }]);
  });

  test("consecutive minutes store the delta", async () => {
    const s = setup();
    s.meteora.readings = [reading({ cumulativeVolume: 500 })];
    await s.run(cycle(), T0);
    s.meteora.readings = [reading({ cumulativeVolume: 740 })];
    await s.run(cycle(), T0 + MINUTE);
    expect(s.db.minutes.get("POOL1")?.map((r) => r.volume)).toEqual([null, 240]);
  });

  test("a missed minute stores null instead of a delta over two minutes", async () => {
    const s = setup();
    s.meteora.readings = [reading({ cumulativeVolume: 500 })];
    await s.run(cycle(), T0);
    s.meteora.readings = [reading({ cumulativeVolume: 900 })];
    await s.run(cycle(), T0 + 2 * MINUTE);
    expect(s.db.minutes.get("POOL1")?.map((r) => r.volume)).toEqual([null, null]);
  });

  test("a cumulative total that goes down stores null", async () => {
    const s = setup();
    s.meteora.readings = [reading({ cumulativeVolume: 500 })];
    await s.run(cycle(), T0);
    s.meteora.readings = [reading({ cumulativeVolume: 100 })];
    await s.run(cycle(), T0 + MINUTE);
    expect(s.db.minutes.get("POOL1")?.map((r) => r.volume)).toEqual([null, null]);
  });

  test("a failing Meteora batch is skipped and the cycle still completes", async () => {
    const s = setup();
    s.meteora.failing = true;
    await s.run(cycle());
    expect(s.db.minutes.size).toBe(0);
    expect(s.telegram.sent).toEqual([]);
  });

  test("pools are read once however many agents watch them", async () => {
    const s = setup({
      watches: [watch(), watch({ agentId: "agent-2", userId: "user-2", agentPoolId: "ap-2" })],
    });
    s.meteora.readings = [reading({ cumulativeVolume: 1 })];
    await s.run(cycle());
    expect(s.meteora.calls).toEqual([["POOL1"]]);
  });

  test("with no runnable agents nothing is fetched", async () => {
    const s = setup({ watches: [] });
    await s.run(cycle());
    expect(s.meteora.calls).toEqual([]);
  });

  test("prune drops rows older than the retention window", async () => {
    const s = setup();
    await s.run(prune());
    expect(s.db.pruned.map((d) => d.getTime())).toEqual([T0 - RETENTION_MS]);
  });
});

describe("evaluate and notify", () => {
  test("warm-up: too little history gives no alert", async () => {
    const s = setup();
    s.db.minutes.set("POOL1", quietHistory("POOL1", 3));
    s.db.chats.set("user-1", 42n);
    s.meteora.readings = [reading({ cumulativeVolume: 10_000 + 3 * 100 + 9000 })];
    await s.run(cycle());
    expect(s.db.alerts).toEqual([]);
    expect(s.telegram.sent).toEqual([]);
  });

  test("a spike writes an alert, sends one message and marks it delivered", async () => {
    const s = spikeScenario(5000);
    await s.run(cycle());
    expect(s.db.alerts).toMatchObject([
      {
        agentId: "agent-1",
        userId: "user-1",
        poolAddress: "POOL1",
        vol1m: 5000,
        baseline: 100,
        ratio: 50,
        delivered: true,
        error: null,
      },
    ]);
    expect(s.telegram.sent).toEqual([
      {
        chatId: 42n,
        text: `⚡ <b>Volume spike</b> DOGE-SOL\n\nVolume 1m: <b>$5.0k</b>\nMedian 5m: $100\nSpike: <b>50.0×</b>\nBin step: 25`,
        botToken: "user-bot-token",
        buttons: [{ text: "View pool on Vexis", url: "https://vexis.test/analytics?pool=POOL1" }],
      },
    ]);
  });

  test("a quiet minute stays quiet", async () => {
    const s = spikeScenario(150);
    await s.run(cycle());
    expect(s.db.alerts).toEqual([]);
  });

  test("cooldown: the next minute's spike is held back, a later one after the window goes out", async () => {
    const s = spikeScenario(5000);
    await s.run(cycle(), T0);
    expect(s.telegram.sent).toHaveLength(1);

    const nextCumulative = (s.db.minutes.get("POOL1")?.at(-1)?.cumulativeVolume ?? 0) + 5000;
    s.meteora.readings = [reading({ cumulativeVolume: nextCumulative })];
    await s.run(cycle(), T0 + MINUTE);
    expect(s.telegram.sent).toHaveLength(1);

    let cumulative = nextCumulative;
    for (const minute of [2, 3, 4, 5]) {
      cumulative += 100;
      s.meteora.readings = [reading({ cumulativeVolume: cumulative })];
      await s.run(cycle(), T0 + minute * MINUTE);
    }
    expect(s.telegram.sent).toHaveLength(1);

    s.meteora.readings = [reading({ cumulativeVolume: cumulative + 5000 })];
    await s.run(cycle(), T0 + 6 * MINUTE);
    expect(s.telegram.sent).toHaveLength(2);
  });

  test("a restart does not double-send: the cooldown comes from the stored last_alert_at", async () => {
    const s = spikeScenario(5000, { watches: [watch({ lastAlertAt: new Date(T0 - MINUTE) })] });
    await s.run(cycle());
    expect(s.telegram.sent).toEqual([]);
    expect(s.db.alerts).toEqual([]);
  });

  test("a failed send is recorded, not delivered, and does not start the cooldown", async () => {
    const s = spikeScenario(5000);
    s.telegram.failSend = true;
    await s.run(cycle());
    expect(s.db.alerts).toMatchObject([{ delivered: false, error: expect.stringContaining("chat not found") }]);
    expect(s.db.watches[0]?.lastAlertAt).toBeNull();

    s.telegram.failSend = false;
    const cumulative = (s.db.minutes.get("POOL1")?.at(-1)?.cumulativeVolume ?? 0) + 5000;
    s.meteora.readings = [reading({ cumulativeVolume: cumulative })];
    await s.run(cycle(), T0 + MINUTE);
    expect(s.telegram.sent).toHaveLength(1);
  });

  test("a user without Telegram gets their agent paused, no alert row", async () => {
    const s = spikeScenario(5000);
    s.db.chats.clear();
    await s.run(cycle());
    expect(s.db.paused.get("agent-1")).toBe("telegram_not_linked");
    expect(s.db.alerts).toEqual([]);
    expect(s.telegram.sent).toEqual([]);
  });

  test("a bot token that no longer decrypts pauses the agent for a re-link, no alert row", async () => {
    const s = spikeScenario(5000);
    const userId = s.db.watches[0]?.userId ?? "";
    s.db.unreadable.add(userId);
    await s.run(cycle());
    expect(s.db.paused.get("agent-1")).toBe("telegram_relink");
    expect(s.db.alerts).toEqual([]);
    expect(s.telegram.sent).toEqual([]);
  });

  test("an alert goes out through the user's own bot", async () => {
    const s = spikeScenario(5000);
    s.db.ownBots.set("user-1", "own-bot-token");
    await s.run(cycle());
    expect(s.telegram.sent).toHaveLength(1);
    expect(s.telegram.sent[0]?.botToken).toBe("own-bot-token");
  });

  test("a row with a bad config is skipped; other agents still run", async () => {
    const s = spikeScenario(5000, {
      watches: [
        watch({ agentId: "broken", agentPoolId: "ap-x", config: { mult: -1 } }),
        watch({ agentId: "ok", agentPoolId: "ap-ok", userId: "user-1" }),
      ],
    });
    await s.run(cycle());
    expect(s.db.alerts.map((a) => a.agentId)).toEqual(["ok"]);
  });

  test("each user is judged by their own config", async () => {
    const s = spikeScenario(5000, {
      watches: [
        watch({
          agentId: "strict",
          agentPoolId: "ap-1",
          userId: "user-1",
          config: { mult: 100, baseline: 5, minUsd: 1000 },
        }),
        watch({
          agentId: "loose",
          agentPoolId: "ap-2",
          userId: "user-2",
          config: { mult: 3, baseline: 5, minUsd: 1000 },
        }),
      ],
    });
    s.db.chats.set("user-2", 7n);
    await s.run(cycle());
    expect(s.db.alerts.map((a) => a.agentId)).toEqual(["loose"]);
    expect(s.telegram.sent.map((m) => m.chatId)).toEqual([7n]);
  });

  test("several pools spiking together make one message per agent", async () => {
    const s = setup({
      watches: [watch(), watch({ agentPoolId: "ap-2", poolAddress: "POOL2" })],
    });
    s.db.chats.set("user-1", 42n);
    for (const pool of ["POOL1", "POOL2"]) s.db.minutes.set(pool, quietHistory(pool, 10));
    s.meteora.readings = [
      reading({ cumulativeVolume: 10_000 + 1000 + 5000 }),
      reading({ address: "POOL2", name: "SOL-USDC", binStep: 10, cumulativeVolume: 10_000 + 1000 + 8000 }),
    ];
    await s.run(cycle());
    expect(s.db.alerts).toHaveLength(2);
    expect(s.telegram.sent).toHaveLength(1);
    expect(s.telegram.sent[0]?.text).toContain("DOGE-SOL");
    expect(s.telegram.sent[0]?.text).toContain("SOL-USDC");
  });
});

describe("format", () => {
  test("formatUsd", () => {
    expect(formatUsd(850)).toBe("$850");
    expect(formatUsd(18_400)).toBe("$18.4k");
    expect(formatUsd(1_250_000)).toBe("$1.3M");
  });

  const line = (over: Partial<SpikeLine> = {}): SpikeLine => ({
    name: "DOGE-SOL",
    binStep: 25,
    poolAddress: "P",
    baselineMin: 30,
    spike: { vol1m: 18_400, baseline: 2_900, ratio: 6.2 },
    ...over,
  });

  test("matches the agreed message", () => {
    expect(formatMessage([line()])).toBe(
      "⚡ <b>Volume spike</b> DOGE-SOL\n\nVolume 1m: <b>$18.4k</b>\nMedian 30m: $2.9k\nSpike: <b>6.2×</b>\nBin step: 25",
    );
  });

  test("a zero baseline reads without an infinite ratio", () => {
    const text = formatMessage([
      line({ binStep: undefined, spike: { vol1m: 6_000, baseline: 0, ratio: Number.POSITIVE_INFINITY } }),
    ]);
    expect(text).toContain("Spike: <b>from zero</b>");
    expect(text).not.toContain("Bin step");
  });

  test("pool names are escaped for HTML", () => {
    expect(formatMessage([line({ name: "A<B>&C" })])).toContain("A&lt;B&gt;&amp;C");
  });

  test("buttons: one per pool, none for a local web url", () => {
    expect(linkButtons([line()], "https://vexis.test/")).toEqual([
      { text: "View pool on Vexis", url: "https://vexis.test/analytics?pool=P" },
    ]);
    expect(linkButtons([line(), line({ name: "SOL-USDC", poolAddress: "Q" })], "https://vexis.test")).toEqual([
      { text: "View DOGE-SOL", url: "https://vexis.test/analytics?pool=P" },
      { text: "View SOL-USDC", url: "https://vexis.test/analytics?pool=Q" },
    ]);
    expect(linkButtons([line()], "http://localhost:3000")).toEqual([]);
  });
});
