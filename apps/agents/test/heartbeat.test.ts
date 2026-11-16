import { describe, expect, test } from "bun:test";
import { judge } from "@vexis/db/heartbeat";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { tracked, watchdog } from "../src/heartbeat/heartbeat.ts";
import { ADMIN, configWith, fakeDb, fakeTelegram, MINUTE, runAt, T0 } from "./fakes.ts";

const beat = (name: string, ago: number, alerted = false) => ({
  name,
  lastTickAt: new Date(T0 - ago),
  lastError: null,
  lastErrorAt: null,
  alertedAt: alerted ? new Date(T0 - MINUTE) : null,
});

describe("judge", () => {
  test("stale after 3 minutes, once; recovered when fresh again; other runtime and unknown rows ignored", () => {
    expect(judge([beat("office-tick", 2 * MINUTE)], "office", T0)).toEqual([]);
    expect(judge([beat("office-tick", 4 * MINUTE)], "office", T0)).toMatchObject([
      { kind: "stale", name: "office-tick" },
    ]);
    expect(judge([beat("office-tick", 9 * MINUTE, true)], "office", T0)).toEqual([]);
    expect(judge([beat("office-tick", MINUTE, true)], "office", T0)).toEqual([
      { kind: "recovered", name: "office-tick" },
    ]);
    expect(judge([beat("cycle", 9 * MINUTE)], "office", T0)).toEqual([]);
    expect(judge([beat("nope", 9 * MINUTE)], "office", T0)).toEqual([]);
    // prune is hourly: three minutes of silence is normal
    expect(judge([beat("prune", 30 * MINUTE)], "runner", T0)).toEqual([]);
  });
});

describe("tracked", () => {
  test("records a tick, or the error and leaves the last good tick", async () => {
    const db = fakeDb();
    await runAt(tracked("cycle", Effect.void).pipe(Effect.provide(db.layer)));
    expect(db.state.beats.get("cycle")?.lastTickAt).toEqual(new Date(T0));

    await runAt(tracked("cycle", Effect.die("boom")).pipe(Effect.provide(db.layer)), T0 + MINUTE);
    const row = db.state.beats.get("cycle");
    expect(row?.lastTickAt).toEqual(new Date(T0));
    expect(row?.lastError).toContain("boom");
  });
});

describe("watchdog", () => {
  const run = (db: ReturnType<typeof fakeDb>, tg: ReturnType<typeof fakeTelegram>, admin: typeof ADMIN | null) =>
    Effect.gen(function* () {
      // two checks a minute apart, then jump to recovery
      yield* watchdog("office");
      yield* TestClock.adjust(MINUTE);
      yield* watchdog("office");
    }).pipe(Effect.provide(Layer.mergeAll(db.layer, tg.layer, configWith(admin))));

  test("one alert per outage, then one recovery", async () => {
    const db = fakeDb();
    const tg = fakeTelegram();
    db.state.beats.set("office-tick", beat("office-tick", 5 * MINUTE));
    await runAt(run(db, tg, ADMIN));
    expect(tg.state.sent).toHaveLength(1);
    expect(tg.state.sent[0]).toMatchObject({ chatId: ADMIN.chatId, botToken: ADMIN.botToken });
    expect(db.state.beats.get("office-tick")?.alertedAt).not.toBeNull();

    db.state.beats.set("office-tick", {
      ...beat("office-tick", 0),
      lastTickAt: new Date(T0 + 10 * MINUTE),
      alertedAt: new Date(T0),
    });
    await runAt(run(db, tg, ADMIN), T0 + 10 * MINUTE);
    expect(tg.state.sent).toHaveLength(2);
    expect(tg.state.sent[1]?.text).toContain("ticking again");
    expect(db.state.beats.get("office-tick")?.alertedAt).toBeNull();
  });

  test("a failed send keeps the alert closed so the next check retries; no admin means silence", async () => {
    const db = fakeDb();
    const tg = fakeTelegram();
    db.state.beats.set("office-tick", beat("office-tick", 5 * MINUTE));
    tg.state.failSend = true;
    await runAt(run(db, tg, ADMIN));
    expect(db.state.beats.get("office-tick")?.alertedAt).toBeNull();

    await runAt(run(db, tg, null));
    expect(tg.state.sent).toHaveLength(0);
  });
});
