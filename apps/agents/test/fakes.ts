import { Effect, Layer, Option } from "effect";
import { TestClock } from "effect/testing";
import { AppConfig } from "../src/AppConfig.ts";
import { Db, type NewAlert, type NewMinute, type Watch } from "../src/Db.ts";
import { MeteoraError, TelegramError } from "../src/errors.ts";
import type { LinkButton } from "../src/format.ts";
import { Meteora, type PoolReading } from "../src/Meteora.ts";
import { Telegram } from "../src/Telegram.ts";

export const MINUTE = 60_000;
/** A whole minute, so test readings land on a minute boundary. */
export const T0 = Date.UTC(2026, 0, 1, 12, 0, 0);

/** Runs an effect at `at` on a TestClock. The one `runPromise` is the test boundary. */
export const runAt = <A, E>(effect: Effect.Effect<A, E>, at: number = T0) =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* TestClock.setTime(at);
      return yield* effect;
    }).pipe(Effect.provide(TestClock.layer())),
  );

export type StoredAlert = NewAlert & { id: string; delivered: boolean; error: string | null };

/** In-memory `Db`: same contract as the Postgres one, state exposed for assertions. */
export function fakeDb(seed: { watches?: Watch[] } = {}) {
  const state = {
    watches: seed.watches ?? [],
    minutes: new Map<string, NewMinute[]>(),
    chats: new Map<string, bigint>(),
    ownBots: new Map<string, string>(),
    /** Users whose stored bot token no longer decrypts. */
    unreadable: new Set<string>(),
    alerts: [] as StoredAlert[],
    paused: new Map<string, string>(),
    pruned: [] as Date[],
  };
  const rowsOf = (pool: string) => state.minutes.get(pool) ?? [];

  const layer = Layer.succeed(
    Db,
    Db.of({
      runnableWatches: () => Effect.succeed(state.watches.filter((w) => !state.paused.has(w.agentId))),
      latestReadings: (pools) =>
        Effect.succeed(
          new Map(
            pools.flatMap((pool) => {
              const last = rowsOf(pool).at(-1);
              return last
                ? [[pool, { minute: last.minute.getTime(), cumulativeVolume: last.cumulativeVolume }] as const]
                : [];
            }),
          ),
        ),
      insertMinutes: (rows) =>
        Effect.sync(() => {
          for (const row of rows) {
            const list = state.minutes.get(row.poolAddress) ?? [];
            if (!list.some((r) => r.minute.getTime() === row.minute.getTime())) list.push(row);
            state.minutes.set(row.poolAddress, list);
          }
        }),
      pruneMinutes: (before) => Effect.sync(() => void state.pruned.push(before)),
      recentMinutes: (pool, limit) =>
        Effect.succeed(
          rowsOf(pool)
            .slice(-limit)
            .map((r) => ({ minute: r.minute.getTime(), volume: r.volume })),
        ),
      telegramTarget: (userId) => {
        const chatId = state.chats.get(userId);
        if (chatId === undefined) return Effect.succeed({ _tag: "missing" } as const);
        if (state.unreadable.has(userId)) return Effect.succeed({ _tag: "unreadable" } as const);
        return Effect.succeed({
          _tag: "ready",
          chatId,
          botToken: state.ownBots.get(userId) ?? "user-bot-token",
        } as const);
      },
      pauseAgent: (agentId, reason) => Effect.sync(() => void state.paused.set(agentId, reason)),
      claimCooldown: (agentPoolId, cooldownMs, now) =>
        Effect.sync(() => {
          const watch = state.watches.find((w) => w.agentPoolId === agentPoolId);
          if (!watch) return Option.none();
          if (watch.lastAlertAt && now.getTime() - watch.lastAlertAt.getTime() < cooldownMs) return Option.none();
          const previous = watch.lastAlertAt;
          state.watches = state.watches.map((w) => (w === watch ? { ...w, lastAlertAt: now } : w));
          return Option.some({ previous });
        }),
      releaseCooldown: (agentPoolId, claimedAt, previous) =>
        Effect.sync(() => {
          state.watches = state.watches.map((w) =>
            w.agentPoolId === agentPoolId && w.lastAlertAt?.getTime() === claimedAt.getTime()
              ? { ...w, lastAlertAt: previous }
              : w,
          );
        }),
      recordAlerts: (alerts) =>
        Effect.sync(() =>
          alerts.map((alert) => {
            const id = `alert-${state.alerts.length + 1}`;
            state.alerts.push({ ...alert, id, delivered: false, error: null });
            return id;
          }),
        ),
      markDelivered: (ids) =>
        Effect.sync(() => {
          for (const alert of state.alerts) if (ids.includes(alert.id)) alert.delivered = true;
        }),
      markFailed: (ids, error) =>
        Effect.sync(() => {
          for (const alert of state.alerts) if (ids.includes(alert.id)) alert.error = error;
        }),
    }),
  );
  return { state, layer };
}

/** Meteora stand-in: `readings` is what the next call returns. */
export function fakeMeteora() {
  const state = { readings: [] as PoolReading[], calls: [] as string[][], failing: false };
  const layer = Layer.succeed(
    Meteora,
    Meteora.of({
      pools: (addresses) => {
        state.calls.push([...addresses]);
        return state.failing
          ? Effect.fail(new MeteoraError({ cause: new Error("down") }))
          : Effect.succeed(state.readings.filter((r) => addresses.includes(r.address)));
      },
    }),
  );
  return { state, layer };
}

/** Telegram stand-in. Set `failSend` to make the next sends fail. */
export function fakeTelegram() {
  const state = {
    sent: [] as { chatId: bigint; text: string; botToken: string; buttons: ReadonlyArray<LinkButton> }[],
    failSend: false,
  };
  const layer = Layer.succeed(
    Telegram,
    Telegram.of({
      send: (chatId, text, botToken, buttons = []) =>
        state.failSend
          ? Effect.fail(new TelegramError({ method: "sendMessage", cause: new Error("chat not found") }))
          : Effect.sync(() => void state.sent.push({ chatId, text, botToken, buttons })),
    }),
  );
  return { state, layer };
}

export const testConfig = Layer.succeed(AppConfig, AppConfig.of({ webUrl: "https://vexis.test" }));

export function watch(overrides: Partial<Watch> = {}): Watch {
  return {
    agentId: "agent-1",
    userId: "user-1",
    agentPoolId: "ap-1",
    poolAddress: "POOL1",
    label: null,
    config: { mult: 3, baseline: 5, minUsd: 1000, cooldownSec: 300 },
    lastAlertAt: null,
    ...overrides,
  };
}

/** `count` quiet minutes of `volume` USD each, ending the minute before `T0`. */
export function quietHistory(pool: string, count: number, volume = 100): NewMinute[] {
  return Array.from({ length: count }, (_, i) => ({
    poolAddress: pool,
    minute: new Date(T0 - (count - i) * MINUTE),
    cumulativeVolume: 10_000 + (i + 1) * volume,
    volume,
    tvl: 1_000_000,
  }));
}

export function reading(overrides: Partial<PoolReading> = {}): PoolReading {
  return { address: "POOL1", name: "DOGE-SOL", binStep: 25, tvl: 1_000_000, cumulativeVolume: 0, ...overrides };
}
