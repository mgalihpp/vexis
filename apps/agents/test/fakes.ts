import { Keypair } from "@solana/web3.js";
import { type AgentKind, REBALANCE_FAILURE_LIMIT } from "@vexis/db/agents";
import { Effect, Layer, Option, Ref } from "effect";
import { TestClock } from "effect/testing";
import { AppConfig } from "../src/AppConfig.ts";
import { Chain, type ChainPosition, type PoolState } from "../src/Chain.ts";
import {
  Db,
  leadingFailures,
  type NewAlert,
  type NewMinute,
  type NewRebalance,
  type RebalanceWatch,
  type ScreenerAgent,
  type WalletSigner,
  type Watch,
} from "../src/Db.ts";
import { ChainError, MeteoraError, TelegramError, ZapError } from "../src/errors.ts";
import { WSOL_MINT } from "../src/fees.ts";
import type { LinkButton } from "../src/format.ts";
import { Meteora, type PoolReading, type ScreenerReading } from "../src/Meteora.ts";
import { ScreenerHistory } from "../src/ScreenerHistory.ts";
import type { History } from "../src/screener-history.ts";
import { Telegram } from "../src/Telegram.ts";
import { type ClaimRequest, type CompoundRequest, type SweepRequest, Zap, type ZapRequest } from "../src/Zap.ts";

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
export type StoredRebalance = NewRebalance & {
  id: string;
  signature: string | null;
  txError: string | null;
  delivered: boolean;
  error: string | null;
};

/** Key for the fake's Telegram state: a link belongs to one user and one agent kind. */
export const link = (userId: string, kind: AgentKind) => `${userId}/${kind}`;

/** In-memory `Db`: same contract as the Postgres one, state exposed for assertions. */
export function fakeDb(
  seed: { watches?: Watch[]; rebalances?: RebalanceWatch[]; screenerAgents?: ScreenerAgent[] } = {},
) {
  const state = {
    watches: seed.watches ?? [],
    screenerAgents: seed.screenerAgents ?? [],
    rebalanceWatches: seed.rebalances ?? [],
    rebalances: [] as StoredRebalance[],
    minutes: new Map<string, NewMinute[]>(),
    /** Telegram state by `link(userId, kind)`. */
    chats: new Map<string, bigint>(),
    ownBots: new Map<string, string>(),
    /** Links whose stored bot token no longer decrypts. */
    unreadable: new Set<string>(),
    alerts: [] as StoredAlert[],
    paused: new Map<string, string>(),
    pruned: [] as Date[],
    /** Agent wallets by user; a user absent here has none. */
    wallets: new Map<string, WalletSigner>(),
  };
  const rowsOf = (pool: string) => state.minutes.get(pool) ?? [];
  let rebalanceIds = 0;

  const layer = Layer.succeed(
    Db,
    Db.of({
      runnableWatches: () => Effect.succeed(state.watches.filter((w) => !state.paused.has(w.agentId))),
      runnableScreenerAgents: () => Effect.succeed(state.screenerAgents.filter((a) => !state.paused.has(a.agentId))),
      alertedPools: (agentId, userId, since) =>
        Effect.succeed(
          new Set(
            state.alerts
              .filter((a) => a.agentId === agentId && a.userId === userId && a.at > since && a.error === null)
              .map((a) => a.poolAddress),
          ),
        ),
      runnableRebalances: () => Effect.succeed(state.rebalanceWatches.filter((w) => !state.paused.has(w.agentId))),
      recordRebalance: (row) =>
        Effect.sync(() => {
          const id = `rebalance-${++rebalanceIds}`;
          state.rebalances.push({ ...row, id, signature: null, txError: null, delivered: false, error: null });
          return id;
        }),
      settleRebalance: (id, error) =>
        Effect.sync(() => {
          for (const r of state.rebalances) {
            if (r.id === id) Object.assign(r, { delivered: error === null, error });
          }
        }),
      settleTransaction: (id, outcome) =>
        Effect.sync(() => {
          for (const r of state.rebalances) {
            if (r.id !== id) continue;
            if (outcome._tag === "sent") Object.assign(r, { signature: outcome.signature, txError: null });
            else Object.assign(r, { signature: null, txError: outcome.error });
          }
        }),
      dropRebalance: (id) =>
        Effect.sync(() => {
          state.rebalances = state.rebalances.filter((r) => r.id !== id);
        }),
      failureStreak: (agentId) =>
        Effect.sync(() =>
          leadingFailures(
            state.rebalances
              .filter((r) => r.agentId === agentId && r.live && r.action === "rebalance")
              .reverse()
              .slice(0, REBALANCE_FAILURE_LIMIT),
          ),
        ),
      walletSigner: (userId) => Effect.succeed(state.wallets.get(userId) ?? { _tag: "missing" }),
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
      telegramTarget: (userId, kind) => {
        const key = link(userId, kind);
        const chatId = state.chats.get(key);
        if (chatId === undefined) return Effect.succeed({ _tag: "missing" } as const);
        if (state.unreadable.has(key)) return Effect.succeed({ _tag: "unreadable" } as const);
        return Effect.succeed({
          _tag: "ready",
          chatId,
          botToken: state.ownBots.get(key) ?? "user-bot-token",
        } as const);
      },
      pauseAgent: (agentId, reason) => Effect.sync(() => void state.paused.set(agentId, reason)),
      claimCooldown: (agentPoolId, cooldownMs, now) =>
        Effect.sync(() => {
          const watch = [...state.watches, ...state.rebalanceWatches].find((w) => w.agentPoolId === agentPoolId);
          if (!watch) return Option.none();
          if (watch.lastAlertAt && now.getTime() - watch.lastAlertAt.getTime() < cooldownMs) return Option.none();
          const previous = watch.lastAlertAt;
          state.watches = state.watches.map((w) => (w === watch ? { ...w, lastAlertAt: now } : w));
          state.rebalanceWatches = state.rebalanceWatches.map((w) => (w === watch ? { ...w, lastAlertAt: now } : w));
          return Option.some({ previous });
        }),
      releaseCooldown: (agentPoolId, claimedAt, previous) =>
        Effect.sync(() => {
          const restore = <W extends Watch>(w: W): W =>
            w.agentPoolId === agentPoolId && w.lastAlertAt?.getTime() === claimedAt.getTime()
              ? { ...w, lastAlertAt: previous }
              : w;
          state.watches = state.watches.map(restore);
          state.rebalanceWatches = state.rebalanceWatches.map(restore);
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

/** Meteora stand-in: `readings` and `screener` are what the next calls return. */
export function fakeMeteora() {
  const state = {
    readings: [] as PoolReading[],
    calls: [] as string[][],
    screener: [] as ScreenerReading[],
    screenerCalls: 0,
    failing: false,
  };
  const down = () => Effect.fail(new MeteoraError({ cause: new Error("down") }));
  const layer = Layer.succeed(
    Meteora,
    Meteora.of({
      pools: (addresses) => {
        state.calls.push([...addresses]);
        return state.failing ? down() : Effect.succeed(state.readings.filter((r) => addresses.includes(r.address)));
      },
      screener: () => {
        state.screenerCalls++;
        return state.failing ? down() : Effect.succeed(state.screener);
      },
    }),
  );
  return { state, layer };
}

/** In-memory history that, like the runner's, outlives a single tick. */
export const screenerHistory = () =>
  Layer.succeed(ScreenerHistory, ScreenerHistory.make(Ref.makeUnsafe<History>(new Map())));

/** A screener-source volume-watch agent on a custom filter that only asks for $10k TVL. */
export function screenerAgent(overrides: Partial<ScreenerAgent> = {}): ScreenerAgent {
  return {
    agentId: "agent-1",
    userId: "user-1",
    config: {
      source: "screener",
      preset: "custom",
      custom: {
        minTvl: 10_000,
        minVolume: 0,
        minMcap: 0,
        maxMcap: 0,
        minStep: 0,
        maxStep: null,
        verified: false,
        minOrganic: 0,
      },
      mult: 3,
      minUsd: 1000,
      cooldownSec: 300,
    },
    ...overrides,
  };
}

/** A clean, verified screener pool with $1M TVL. */
export function screenerReading(overrides: Partial<ScreenerReading> = {}): ScreenerReading {
  return {
    ...reading(),
    volume24h: 1_000_000,
    blacklisted: false,
    baseMcap: 50_000_000,
    bothVerified: true,
    baseOrganic: 80,
    freezable: false,
    ...overrides,
  };
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

export const TEST_RPC = "https://rpc.test/?api-key=secret-key";

/** A funded position spanning bins 100..120 with no unclaimed fees. */
export const chainPosition = (overrides: Partial<ChainPosition> = {}): ChainPosition => ({
  address: "POS1",
  lowerBinId: 100,
  upperBinId: 120,
  funded: true,
  feeX: 0n,
  feeY: 0n,
  ...overrides,
});

/** A JUP-SOL pool (SOL on Y) at 0.5 lamports per X lamport, read for a wallet holding 1 SOL. */
export const poolState = (overrides: Partial<PoolState> = {}): PoolState => ({
  activeBinId: 110,
  pricePerLamport: "0.5",
  mintX: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  mintY: WSOL_MINT,
  positions: [chainPosition()],
  nativeLamports: 1_000_000_000n,
  ...overrides,
});

/** Chain stand-in: `pools` maps a pool address to what the next read returns; a missing pool fails. */
export function fakeChain(pools: Record<string, PoolState> = {}) {
  const state = { pools, calls: [] as { rpcUrl: string; pool: string; owner: string }[] };
  const layer = Layer.succeed(
    Chain,
    Chain.of({
      pool: (rpcUrl, poolAddress, owner) => {
        state.calls.push({ rpcUrl, pool: poolAddress, owner });
        const found = state.pools[poolAddress];
        return found
          ? Effect.succeed(found)
          : Effect.fail(new ChainError({ poolAddress, cause: new Error("rpc down") }));
      },
    }),
  );
  return { state, layer };
}

export function rebalanceWatch(overrides: Partial<RebalanceWatch> = {}): RebalanceWatch {
  return {
    ...watch({ agentId: "rb-agent-1", agentPoolId: "rb-ap-1", label: "SOL-USDC" }),
    config: { strategy: "Curve", slippageBps: 50, halfWidth: null, cooldownSec: 300 },
    owner: "OWNER1",
    rpc: { _tag: "ready", url: TEST_RPC },
    ...overrides,
  };
}

/**
 * Zap stand-in: never signs or sends. `fail` makes the next rebalances fail with that message, `failClaim` and
 * `failFees` the claims and the compound or sweep steps; `noFee` makes a claim find nothing. `inFlight` and
 * `maxInFlight` measure overlap: each rebalance yields a few times while counted, so concurrent calls would interleave.
 */
export function fakeZap() {
  const state = {
    calls: [] as { rpcUrl: string; owner: string; request: ZapRequest }[],
    claims: [] as ClaimRequest[],
    compounds: [] as CompoundRequest[],
    sweeps: [] as SweepRequest[],
    fail: null as string | null,
    failClaim: null as string | null,
    failFees: null as string | null,
    noFee: false,
    inFlight: 0,
    maxInFlight: 0,
  };
  const feeStep = <R>(list: R[], request: R, signature: string) =>
    Effect.suspend(() => {
      list.push(request);
      return state.failFees === null
        ? Effect.succeed(signature)
        : Effect.fail(new ZapError({ message: state.failFees }));
    });
  const layer = Layer.succeed(
    Zap,
    Zap.of({
      claimFees: (_rpcUrl, _signer, request) =>
        Effect.suspend(() => {
          state.claims.push(request);
          if (state.failClaim !== null) return Effect.fail(new ZapError({ message: state.failClaim }));
          return Effect.succeed(state.noFee ? null : `CLAIM${state.claims.length}`);
        }),
      compound: (_rpcUrl, _signer, request) =>
        feeStep(state.compounds, request, `COMPOUND${state.compounds.length + 1}`),
      sweep: (_rpcUrl, _signer, request) => feeStep(state.sweeps, request, `SWEEP${state.sweeps.length + 1}`),
      rebalance: (rpcUrl, signer, request) =>
        Effect.gen(function* () {
          state.calls.push({ rpcUrl, owner: signer.publicKey.toBase58(), request });
          state.inFlight++;
          state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
          for (let i = 0; i < 5; i++) yield* Effect.yieldNow;
          state.inFlight--;
          if (state.fail !== null) return yield* new ZapError({ message: state.fail });
          return `SIG${state.calls.length}`;
        }),
    }),
  );
  return { state, layer };
}

/** A ready agent wallet with a key made for the test; never a real one. */
export const testWallet = (): WalletSigner => ({ _tag: "ready", signer: Keypair.generate() });
