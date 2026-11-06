import { type AgentConfig, parseAgentConfig } from "@vexis/db/agents";
import { Clock, Effect, Option } from "effect";
import { AppConfig } from "./AppConfig.ts";
import { Chain } from "./Chain.ts";
import {
  Db,
  REBALANCE_FAILING,
  REBALANCE_FAILURE_LIMIT,
  type RebalanceWatch,
  TELEGRAM_NOT_LINKED,
  TELEGRAM_RELINK,
  type TxOutcome,
  WALLET_UNREADABLE,
} from "./Db.ts";
import { BadAgentConfig } from "./errors.ts";
import {
  formatRebalanceFailed,
  formatRebalancePreview,
  formatRebalanceSent,
  linkButtons,
  type RebalanceLine,
} from "./format.ts";
import { halfWidthFor, type OnChainPosition, outOfRange, pickPosition, targetRange } from "./range.ts";
import { Telegram } from "./Telegram.ts";
import { Zap } from "./Zap.ts";

type Config = AgentConfig<"auto-rebalance">;

/** Wallets checked at once. Each still reads its pools one at a time. */
const WALLET_CONCURRENCY = 4;

/**
 * One tick for auto-rebalance agents: read each watched pool on-chain for the agent's wallet and, when its one funded
 * position left its range, either record and report a preview (`dryRun`) or rebalance it on-chain. Pools sharing a
 * wallet run one after another, so a wallet never has two transactions in flight. A failure in one pool is logged and
 * does not stop the others.
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

const checkPool = Effect.fn("checkPool")(function* (watch: RebalanceWatch) {
  const config = yield* Effect.try({
    try: (): Config => parseAgentConfig("auto-rebalance", watch.config),
    catch: (cause) => new BadAgentConfig({ agentId: watch.agentId, cause }),
  });
  const chain = yield* Chain;
  const state = yield* chain.pool(watch.poolAddress, watch.owner);
  const pick = pickPosition(state.positions);
  if (pick._tag === "none") return "ok" satisfies Outcome;
  if (pick._tag === "many") {
    yield* Effect.logWarning(
      `agent ${watch.agentId}: ${pick.addresses.length} funded positions in ${watch.poolAddress}, not picking one`,
    );
    return "ok" satisfies Outcome;
  }
  const { position } = pick;
  if (!outOfRange(state.activeBinId, position)) return "ok" satisfies Outcome;
  return yield* act(watch, config, state.activeBinId, position);
});

const pause = (agentId: string, reason: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    yield* db.pauseAgent(agentId, reason);
    yield* Effect.logInfo(`agent ${agentId} paused: ${reason}`);
    return "paused" satisfies Outcome;
  });

/**
 * Same order as the volume alert: cooldown slot, row, act, notify, settle. A preview whose message fails hands the
 * slot back; a live attempt never does, since the transaction (or its failure) already happened.
 */
const act = Effect.fn("actOnRebalance")(function* (
  watch: RebalanceWatch,
  config: Config,
  activeBinId: number,
  position: OnChainPosition,
) {
  const db = yield* Db;
  const telegram = yield* Telegram;
  const zap = yield* Zap;
  const { webUrl } = yield* AppConfig;
  const live = !config.dryRun;

  const target = yield* db.telegramTarget(watch.userId, "auto-rebalance");
  if (target._tag !== "ready")
    return yield* pause(watch.agentId, target._tag === "missing" ? TELEGRAM_NOT_LINKED : TELEGRAM_RELINK);

  const wallet = live ? yield* db.walletSigner(watch.userId) : undefined;
  if (wallet?._tag === "missing") return "ok" satisfies Outcome;
  if (wallet?._tag === "unreadable") return yield* pause(watch.agentId, WALLET_UNREADABLE);

  const at = new Date(yield* Clock.currentTimeMillis);
  const slot = yield* db.claimCooldown(watch.agentPoolId, config.cooldownSec * 1000, at);
  if (Option.isNone(slot)) return "ok" satisfies Outcome;
  const release = db.releaseCooldown(watch.agentPoolId, at, slot.value.previous);

  const to = targetRange(config, activeBinId, position);
  const id = yield* db
    .recordRebalance({
      agentId: watch.agentId,
      userId: watch.userId,
      poolAddress: watch.poolAddress,
      positionAddress: position.address,
      activeBin: activeBinId,
      lowerBin: position.lowerBinId,
      upperBin: position.upperBinId,
      newLowerBin: to.lowerBinId,
      newUpperBin: to.upperBinId,
      live,
      at,
    })
    .pipe(Effect.tapError(() => release.pipe(Effect.ignore)));

  const line: RebalanceLine = {
    name: watch.label ?? watch.poolAddress,
    poolAddress: watch.poolAddress,
    activeBinId,
    from: position,
    to,
    strategy: config.strategy,
    slippageBps: config.slippageBps,
  };
  const deliver = (text: string, onFailure: Effect.Effect<void, never>) =>
    telegram.send(target.chatId, text, target.botToken, linkButtons([line], webUrl)).pipe(
      Effect.matchEffect({
        onSuccess: () => db.settleRebalance(id, null),
        onFailure: (error) =>
          Effect.logWarning(`telegram send failed for agent ${watch.agentId}`, error.cause).pipe(
            Effect.andThen(db.settleRebalance(id, String(error.cause))),
            Effect.andThen(onFailure),
          ),
      }),
    );

  if (wallet?._tag !== "ready") {
    yield* deliver(formatRebalancePreview(line), release.pipe(Effect.ignore));
    return "ok" satisfies Outcome;
  }

  const outcome: TxOutcome = yield* zap
    .rebalance(wallet.signer, {
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
    yield* deliver(formatRebalanceSent(line, outcome.signature), Effect.void);
    return "ok" satisfies Outcome;
  }
  // The cooldown spaces the retries; this stops a failure that will not fix itself from retrying forever.
  const failures = yield* db.failureStreak(watch.agentId);
  const stop = failures >= REBALANCE_FAILURE_LIMIT;
  yield* deliver(
    formatRebalanceFailed(
      line,
      outcome.error,
      stop ? { paused: true, failures } : { paused: false, cooldownSec: config.cooldownSec },
    ),
    Effect.void,
  );
  return stop ? yield* pause(watch.agentId, REBALANCE_FAILING) : ("ok" satisfies Outcome);
});
