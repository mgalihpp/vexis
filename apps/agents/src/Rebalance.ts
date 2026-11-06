import type { Keypair } from "@solana/web3.js";
import { type AgentConfig, parseAgentConfig } from "@vexis/db/agents";
import { Clock, Effect, Option } from "effect";
import { AppConfig } from "./AppConfig.ts";
import { Chain, type ChainPosition, type PoolState } from "./Chain.ts";
import {
  Db,
  LOW_SOL,
  REBALANCE_FAILING,
  REBALANCE_FAILURE_LIMIT,
  type RebalanceWatch,
  TELEGRAM_NOT_LINKED,
  TELEGRAM_RELINK,
  type TelegramTarget,
  type TxOutcome,
  WALLET_UNREADABLE,
} from "./Db.ts";
import { BadAgentConfig } from "./errors.ts";
import { feeValueInLamports, lamportsToSol, solToLamports } from "./fees.ts";
import {
  type FeeStep,
  formatFeesClaimed,
  formatLowSol,
  formatRebalanceFailed,
  formatRebalancePreview,
  formatRebalanceSent,
  linkButtons,
  type RebalanceLine,
} from "./format.ts";
import { halfWidthFor, outOfRange, pickPosition, targetRange } from "./range.ts";
import { Telegram } from "./Telegram.ts";
import { Zap } from "./Zap.ts";

type Config = AgentConfig<"auto-rebalance">;

/** Wallets checked at once. Each still reads its pools one at a time. */
const WALLET_CONCURRENCY = 4;

/**
 * One tick for auto-rebalance agents: read each watched pool on-chain through the user's RPC and, when the wallet's one
 * funded position left its range, either record and report a preview (`dryRun`) or rebalance it on-chain; in range,
 * claim its fees once they pass the agent's threshold. Pools sharing a wallet run one after another, so a wallet
 * never has two transactions in flight. A failure in one pool is logged and does not stop the others.
 */
export const rebalanceCycle = Effect.fn("rebalanceCycle")(function* () {
  const db = yield* Db;
  const watches = yield* db.runnableRebalances();
  const byWallet = new Map<string, RebalanceWatch[]>();
  for (const w of watches) byWallet.set(w.owner, [...(byWallet.get(w.owner) ?? []), w]);
  yield* Effect.forEach(
    byWallet.values(),
    (group) =>
      Effect.gen(function* () {
        // An agent paused earlier in this tick is not acted on again for its other pools.
        const paused = new Set<string>();
        for (const watch of group) {
          if (paused.has(watch.agentId)) continue;
          const outcome = yield* checkPool(watch).pipe(
            Effect.catchTags({
              BadAgentConfig: (error) =>
                Effect.logWarning(`skipping agent ${error.agentId}: bad config`, error.cause).pipe(Effect.as("ok")),
              ChainError: (error) =>
                Effect.logWarning(`chain read failed for pool ${error.poolAddress}`, error.cause).pipe(Effect.as("ok")),
              DbError: (error) =>
                Effect.logError(`rebalance for agent ${watch.agentId} failed: ${error.operation}`, error.cause).pipe(
                  Effect.as("ok"),
                ),
            }),
          );
          if (outcome === "paused") paused.add(watch.agentId);
        }
      }),
    { concurrency: WALLET_CONCURRENCY, discard: true },
  );
});

type Outcome = "ok" | "paused";

/** One read of the pool, with the picked position and what its fees are worth. */
type Reading = {
  readonly rpcUrl: string;
  readonly state: PoolState;
  readonly position: ChainPosition;
  /** Null when neither side of the pool is SOL. */
  readonly feeLamports: bigint | null;
};

const checkPool = Effect.fn("checkPool")(function* (watch: RebalanceWatch) {
  // No RPC yet: skipped like an agent without a wallet until the user adds one. An unreadable one was saved with the
  // wallet, and saving the wallet again stores both under the current key.
  if (watch.rpc._tag === "missing") return "ok" satisfies Outcome;
  if (watch.rpc._tag === "unreadable") return yield* pause(watch.agentId, WALLET_UNREADABLE);
  const rpcUrl = watch.rpc.url;
  const config = yield* Effect.try({
    try: (): Config => parseAgentConfig("auto-rebalance", watch.config),
    catch: (cause) => new BadAgentConfig({ agentId: watch.agentId, cause }),
  });
  const chain = yield* Chain;
  const state = yield* chain.pool(rpcUrl, watch.poolAddress, watch.owner);
  const pick = pickPosition(state.positions);
  if (pick._tag === "none") return "ok" satisfies Outcome;
  if (pick._tag === "many") {
    yield* Effect.logWarning(
      `agent ${watch.agentId}: ${pick.addresses.length} funded positions in ${watch.poolAddress}, not picking one`,
    );
    return "ok" satisfies Outcome;
  }
  const { position } = pick;
  const reading: Reading = {
    rpcUrl,
    state,
    position,
    feeLamports: feeValueInLamports({
      feeX: position.feeX,
      feeY: position.feeY,
      mintX: state.mintX,
      mintY: state.mintY,
      pricePerLamport: state.pricePerLamport,
    }),
  };
  if (outOfRange(state.activeBinId, position)) return yield* rebalance(watch, config, reading);
  return yield* claimInRange(watch, config, reading);
});

const pause = (agentId: string, reason: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.pauseAgent(agentId, reason);
    yield* Effect.logInfo(`agent ${agentId} paused: ${reason}`);
    return "paused" satisfies Outcome;
  });

type Ready = Extract<TelegramTarget, { _tag: "ready" }>;

/**
 * What every action needs before it claims the cooldown: a Telegram chat and, for a live action, a readable wallet
 * holding at least the SOL reserve. Too little SOL pauses the agent with one message; a preview has no balance gate.
 */
const prepare = Effect.fn("prepare")(function* (
  watch: RebalanceWatch,
  config: Config,
  state: PoolState,
  live: boolean,
) {
  const db = yield* Db;
  const telegram = yield* Telegram;
  const target = yield* db.telegramTarget(watch.userId, "auto-rebalance");
  if (target._tag !== "ready") {
    const outcome = yield* pause(watch.agentId, target._tag === "missing" ? TELEGRAM_NOT_LINKED : TELEGRAM_RELINK);
    return { _tag: "stop", outcome } as const;
  }
  if (!live) return { _tag: "go", target, signer: null } as const;

  const wallet = yield* db.walletSigner(watch.userId);
  if (wallet._tag === "missing") return { _tag: "stop", outcome: "ok" satisfies Outcome } as const;
  if (wallet._tag === "unreadable")
    return { _tag: "stop", outcome: yield* pause(watch.agentId, WALLET_UNREADABLE) } as const;

  if (state.nativeLamports < solToLamports(config.solReserve)) {
    const text = formatLowSol(nameOf(watch), lamportsToSol(state.nativeLamports), config.solReserve);
    yield* telegram
      .send(target.chatId, text, target.botToken)
      .pipe(
        Effect.catchTag("TelegramError", (error) =>
          Effect.logWarning(`low SOL message failed for agent ${watch.agentId}`, error.cause),
        ),
      );
    return { _tag: "stop", outcome: yield* pause(watch.agentId, LOW_SOL) } as const;
  }
  return { _tag: "go", target, signer: wallet.signer } as const;
});

const nameOf = (watch: RebalanceWatch) => watch.label ?? watch.poolAddress;

/** Sends a row's message and settles its delivery; `onFailure` runs after a failed send is recorded. */
const deliver = (watch: RebalanceWatch, target: Ready, id: string, text: string, onFailure: Effect.Effect<void>) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const telegram = yield* Telegram;
    const { webUrl } = yield* AppConfig;
    const buttons = linkButtons([{ name: nameOf(watch), poolAddress: watch.poolAddress }], webUrl);
    yield* telegram.send(target.chatId, text, target.botToken, buttons).pipe(
      Effect.matchEffect({
        onSuccess: () => db.settleRebalance(id, null),
        onFailure: (error) =>
          Effect.logWarning(`telegram send failed for agent ${watch.agentId}`, error.cause).pipe(
            Effect.andThen(db.settleRebalance(id, String(error.cause))),
            Effect.andThen(onFailure),
          ),
      }),
    );
  });

/**
 * After the zap (which claims fees) or an in-range claim: compound or sweep what was claimed. Undefined when the mode
 * keeps fees or there were none. A failure is reported, never raised: the transaction before it already happened.
 */
const feeStep = Effect.fn("feeStep")(function* (
  watch: RebalanceWatch,
  config: Config,
  reading: Reading,
  signer: Keypair,
) {
  const { feeMode } = config;
  const { feeX, feeY } = reading.position;
  if (feeMode === "keep" || (feeX <= 0n && feeY <= 0n)) return undefined;
  const zap = yield* Zap;
  const step =
    feeMode === "compound"
      ? zap.compound(reading.rpcUrl, signer, {
          poolAddress: watch.poolAddress,
          positionAddress: reading.position.address,
          feeX,
          feeY,
          strategy: config.strategy,
          slippageBps: config.slippageBps,
          reserveLamports: solToLamports(config.solReserve),
        })
      : zap.sweep(reading.rpcUrl, signer, {
          poolAddress: watch.poolAddress,
          feeX,
          feeY,
          slippageBps: config.slippageBps,
        });
  return yield* step.pipe(
    Effect.match({
      onSuccess: (signature): FeeStep => ({ _tag: "done", mode: feeMode, signature }),
      onFailure: (error): FeeStep => ({ _tag: "failed", mode: feeMode, error: error.message }),
    }),
    Effect.tap((result) =>
      result._tag === "failed"
        ? Effect.logWarning(`agent ${watch.agentId}: ${feeMode} after the transaction failed: ${result.error}`)
        : Effect.void,
    ),
  );
});

/**
 * Same order as the volume alert: cooldown slot, row, act, notify, settle. A preview whose message fails hands the
 * slot back; a live attempt never does, since the transaction (or its failure) already happened.
 */
const rebalance = Effect.fn("rebalance")(function* (watch: RebalanceWatch, config: Config, reading: Reading) {
  const db = yield* Db;
  const zap = yield* Zap;
  const { state, position } = reading;
  const ready = yield* prepare(watch, config, state, !config.dryRun);
  if (ready._tag === "stop") return ready.outcome;

  const at = new Date(yield* Clock.currentTimeMillis);
  const slot = yield* db.claimCooldown(watch.agentPoolId, config.cooldownSec * 1000, at);
  if (Option.isNone(slot)) return "ok" satisfies Outcome;
  const release = db.releaseCooldown(watch.agentPoolId, at, slot.value.previous).pipe(Effect.ignore);

  const to = targetRange(config, state.activeBinId, position);
  const id = yield* db
    .recordRebalance({
      action: "rebalance",
      feeSol: reading.feeLamports === null ? null : lamportsToSol(reading.feeLamports),
      agentId: watch.agentId,
      userId: watch.userId,
      poolAddress: watch.poolAddress,
      positionAddress: position.address,
      activeBin: state.activeBinId,
      lowerBin: position.lowerBinId,
      upperBin: position.upperBinId,
      newLowerBin: to.lowerBinId,
      newUpperBin: to.upperBinId,
      live: ready.signer !== null,
      at,
    })
    .pipe(Effect.tapError(() => release));

  const line: RebalanceLine = {
    name: nameOf(watch),
    poolAddress: watch.poolAddress,
    activeBinId: state.activeBinId,
    from: position,
    to,
    strategy: config.strategy,
    slippageBps: config.slippageBps,
    feeMode: config.feeMode,
  };

  if (ready.signer === null) {
    yield* deliver(watch, ready.target, id, formatRebalancePreview(line), release);
    return "ok" satisfies Outcome;
  }

  const outcome: TxOutcome = yield* zap
    .rebalance(reading.rpcUrl, ready.signer, {
      poolAddress: watch.poolAddress,
      positionAddress: position.address,
      strategy: config.strategy,
      slippageBps: config.slippageBps,
      halfWidth: halfWidthFor(config, position),
    })
    .pipe(
      Effect.match({
        onSuccess: (signature): TxOutcome => ({ _tag: "sent", signature }),
        onFailure: (error): TxOutcome => ({ _tag: "failed", error: error.message }),
      }),
    );
  if (outcome._tag === "sent") {
    yield* Effect.logInfo(`agent ${watch.agentId} rebalanced ${position.address}: ${outcome.signature}`);
  } else {
    yield* Effect.logWarning(`agent ${watch.agentId} rebalance of ${position.address} failed: ${outcome.error}`);
  }
  // The transaction already happened: a failed write must not also lose the Telegram message.
  yield* db
    .settleTransaction(id, outcome)
    .pipe(Effect.catchTag("DbError", (error) => Effect.logError(`could not store rebalance ${id}`, error.cause)));

  if (outcome._tag === "sent") {
    const fees = yield* feeStep(watch, config, reading, ready.signer);
    yield* deliver(watch, ready.target, id, formatRebalanceSent(line, outcome.signature, fees), Effect.void);
    return "ok" satisfies Outcome;
  }
  // The cooldown spaces the retries; this stops a failure that will not fix itself from retrying forever.
  const failures = yield* db.failureStreak(watch.agentId);
  const stop = failures >= REBALANCE_FAILURE_LIMIT;
  yield* deliver(
    watch,
    ready.target,
    id,
    formatRebalanceFailed(
      line,
      outcome.error,
      stop ? { paused: true, failures } : { paused: false, cooldownSec: config.cooldownSec },
    ),
    Effect.void,
  );
  return stop ? yield* pause(watch.agentId, REBALANCE_FAILING) : ("ok" satisfies Outcome);
});

/**
 * In range: once the position's unclaimed fees are worth `feeClaimThresholdSol`, claim them and compound or sweep
 * them, sharing the per-pool cooldown with rebalances. Needs a SOL side to value the fees. A preview only logs, and a
 * failed claim is reported but never pauses the agent.
 */
const claimInRange = Effect.fn("claimInRange")(function* (watch: RebalanceWatch, config: Config, reading: Reading) {
  const db = yield* Db;
  const zap = yield* Zap;
  const { state, position, feeLamports } = reading;
  const threshold = config.feeClaimThresholdSol;
  if (config.feeMode === "keep" || threshold === null) return "ok" satisfies Outcome;
  if (feeLamports === null) {
    yield* Effect.logDebug(`agent ${watch.agentId}: ${watch.poolAddress} has no SOL side, fees are not valued`);
    return "ok" satisfies Outcome;
  }
  if (feeLamports < solToLamports(threshold)) return "ok" satisfies Outcome;
  const feeSol = lamportsToSol(feeLamports);
  if (config.dryRun) {
    yield* Effect.logInfo(`agent ${watch.agentId}: fees worth ${feeSol} SOL would be claimed (preview)`);
    return "ok" satisfies Outcome;
  }

  const ready = yield* prepare(watch, config, state, true);
  if (ready._tag === "stop") return ready.outcome;
  if (ready.signer === null) return "ok" satisfies Outcome;
  const signer = ready.signer;

  const at = new Date(yield* Clock.currentTimeMillis);
  const slot = yield* db.claimCooldown(watch.agentPoolId, config.cooldownSec * 1000, at);
  if (Option.isNone(slot)) return "ok" satisfies Outcome;
  const release = db.releaseCooldown(watch.agentPoolId, at, slot.value.previous).pipe(Effect.ignore);

  const id = yield* db
    .recordRebalance({
      action: "claim",
      feeSol,
      agentId: watch.agentId,
      userId: watch.userId,
      poolAddress: watch.poolAddress,
      positionAddress: position.address,
      activeBin: state.activeBinId,
      lowerBin: position.lowerBinId,
      upperBin: position.upperBinId,
      newLowerBin: position.lowerBinId,
      newUpperBin: position.upperBinId,
      live: true,
      at,
    })
    .pipe(Effect.tapError(() => release));

  const claimed = yield* zap
    .claimFees(reading.rpcUrl, signer, {
      poolAddress: watch.poolAddress,
      positionAddress: position.address,
    })
    .pipe(
      Effect.match({
        onSuccess: (signature) =>
          signature === null ? ({ _tag: "none" } as const) : ({ _tag: "sent", signature } as const),
        onFailure: (error) => ({ _tag: "failed", error: error.message }) as const,
      }),
    );
  if (claimed._tag === "none") {
    // The read saw fees the SDK no longer finds (claimed elsewhere in between): nothing happened, so nothing is kept.
    yield* db.dropRebalance(id);
    yield* release;
    return "ok" satisfies Outcome;
  }

  const line = { name: nameOf(watch), poolAddress: watch.poolAddress, feeSol, thresholdSol: threshold };
  if (claimed._tag === "failed") {
    yield* Effect.logWarning(`agent ${watch.agentId} fee claim of ${position.address} failed: ${claimed.error}`);
    yield* db.settleTransaction(id, claimed);
    yield* deliver(watch, ready.target, id, formatFeesClaimed(line, claimed), Effect.void);
    return "ok" satisfies Outcome;
  }

  yield* Effect.logInfo(`agent ${watch.agentId} claimed fees of ${position.address}: ${claimed.signature}`);
  yield* db
    .settleTransaction(id, claimed)
    .pipe(Effect.catchTag("DbError", (error) => Effect.logError(`could not store claim ${id}`, error.cause)));
  const fees: FeeStep = (yield* feeStep(watch, config, reading, signer)) ?? {
    _tag: "done",
    mode: config.feeMode,
    signature: null,
  };
  yield* deliver(watch, ready.target, id, formatFeesClaimed(line, { ...claimed, fees }), Effect.void);
  return "ok" satisfies Outcome;
});
