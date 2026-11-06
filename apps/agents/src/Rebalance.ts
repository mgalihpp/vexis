import { type AgentConfig, parseAgentConfig } from "@vexis/db/agents";
import { Clock, Effect, Option } from "effect";
import { AppConfig } from "./AppConfig.ts";
import { Chain } from "./Chain.ts";
import { Db, type RebalanceWatch, TELEGRAM_NOT_LINKED, TELEGRAM_RELINK } from "./Db.ts";
import { BadAgentConfig } from "./errors.ts";
import { formatRebalancePreview, linkButtons } from "./format.ts";
import { outOfRange, pickPosition, targetRange } from "./range.ts";
import { Telegram } from "./Telegram.ts";

type Config = AgentConfig<"auto-rebalance">;

/**
 * One tick for auto-rebalance agents: read each watched pool on-chain for the agent's wallet and,
 * when its one funded position left its range, record and send a preview of the move. Nothing is
 * signed or sent on-chain yet. A failure in one pool is logged and does not stop the others.
 */
export const rebalanceCycle = Effect.fn("rebalanceCycle")(function* () {
  const db = yield* Db;
  const watches = yield* db.runnableRebalances();
  yield* Effect.forEach(
    watches,
    (watch) =>
      checkPool(watch).pipe(
        Effect.catchTags({
          BadAgentConfig: (error) => Effect.logWarning(`skipping agent ${error.agentId}: bad config`, error.cause),
          ChainError: (error) => Effect.logWarning(`chain read failed for pool ${error.poolAddress}`, error.cause),
          DbError: (error) =>
            Effect.logError(`rebalance for agent ${watch.agentId} failed: ${error.operation}`, error.cause),
        }),
      ),
    { discard: true },
  );
});

const checkPool = Effect.fn("checkPool")(function* (watch: RebalanceWatch) {
  const config = yield* Effect.try({
    try: (): Config => parseAgentConfig("auto-rebalance", watch.config),
    catch: (cause) => new BadAgentConfig({ agentId: watch.agentId, cause }),
  });
  const chain = yield* Chain;
  const state = yield* chain.pool(watch.poolAddress, watch.owner);
  const pick = pickPosition(state.positions);
  if (pick._tag === "none") return;
  if (pick._tag === "many") {
    yield* Effect.logWarning(
      `agent ${watch.agentId}: ${pick.addresses.length} funded positions in ${watch.poolAddress}, not picking one`,
    );
    return;
  }
  const { position } = pick;
  if (!outOfRange(state.activeBinId, position)) return;
  yield* notify(watch, config, state.activeBinId, position);
});

/** Same order as the volume alert: cooldown slot, undelivered row, send, settle; a failed send hands the slot back. */
const notify = Effect.fn("notifyRebalance")(function* (
  watch: RebalanceWatch,
  config: Config,
  activeBinId: number,
  position: { readonly address: string; readonly lowerBinId: number; readonly upperBinId: number },
) {
  const db = yield* Db;
  const telegram = yield* Telegram;
  const { webUrl } = yield* AppConfig;

  const target = yield* db.telegramTarget(watch.userId);
  if (target._tag !== "ready") {
    const reason = target._tag === "missing" ? TELEGRAM_NOT_LINKED : TELEGRAM_RELINK;
    yield* db.pauseAgent(watch.agentId, reason);
    yield* Effect.logInfo(`agent ${watch.agentId} paused: ${reason}`);
    return;
  }

  const at = new Date(yield* Clock.currentTimeMillis);
  const slot = yield* db.claimCooldown(watch.agentPoolId, config.cooldownSec * 1000, at);
  if (Option.isNone(slot)) return;
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
      at,
    })
    .pipe(Effect.tapError(() => release.pipe(Effect.ignore)));

  const line = {
    name: watch.label ?? watch.poolAddress,
    poolAddress: watch.poolAddress,
    activeBinId,
    from: position,
    to,
    strategy: config.strategy,
    slippageBps: config.slippageBps,
  };
  yield* telegram.send(target.chatId, formatRebalancePreview(line), target.botToken, linkButtons([line], webUrl)).pipe(
    Effect.matchEffect({
      onSuccess: () => db.settleRebalance(id, null),
      onFailure: (error) =>
        Effect.logWarning(`telegram send failed for agent ${watch.agentId}`, error.cause).pipe(
          Effect.andThen(db.settleRebalance(id, String(error.cause))),
          Effect.andThen(release),
        ),
    }),
  );
});
