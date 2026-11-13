import { parseAgentConfig } from "@vexis/db/agents";
import { alertable, SCREENER_BASELINE, type ScreenRule, screenRule } from "@vexis/db/screen";
import { Clock, Effect, Option } from "effect";
import { AppConfig } from "./AppConfig.ts";
import { Db, type ScreenerAgent } from "./Db.ts";
import { volumeTarget } from "./Evaluate.ts";
import { BadAgentConfig } from "./errors.ts";
import { formatMessage, linkButtons, type SpikeLine } from "./format.ts";
import { Meteora, type ScreenerReading } from "./Meteora.ts";
import { ScreenerHistory } from "./ScreenerHistory.ts";
import type { History } from "./screener-history.ts";
import { evaluateSpike, type Spike } from "./spike.ts";
import { Telegram } from "./Telegram.ts";

/** Pools per Telegram message; the minute's other spikes are counted in one closing line. */
export const MAX_SCREENER_ALERTS = 5;
const MINUTE_MS = 60_000;

type Hit = { readonly reading: ScreenerReading; readonly spike: Spike };

const ruleOf = (agent: ScreenerAgent) =>
  Effect.try({
    try: () => {
      const config = parseAgentConfig("volume-watch", agent.config);
      const rule = screenRule(config);
      if (!rule) throw new Error("custom preset without a filter");
      return { rule, cooldownMs: config.cooldownSec * 1000 };
    },
    catch: (cause) => new BadAgentConfig({ agentId: agent.agentId, cause }),
  });

/**
 * One tick for screener-source volume-watch agents: read every screener pool in one request, record every pool's
 * minute (so a pool entering a filter already has a baseline), then judge each agent's matching pools.
 */
export const screenerCycle = Effect.fn("screenerCycle")(function* () {
  const db = yield* Db;
  const agents = yield* db.runnableScreenerAgents();
  if (agents.length === 0) return;

  const readings = yield* (yield* Meteora).screener();
  const now = yield* Clock.currentTimeMillis;
  const history = yield* (yield* ScreenerHistory).record(readings, Math.floor(now / MINUTE_MS) * MINUTE_MS);

  yield* Effect.forEach(
    agents,
    (agent) =>
      ruleOf(agent).pipe(
        Effect.flatMap(({ rule, cooldownMs }) =>
          notifyScreener(agent, cooldownMs, spikes(readings, history, rule, now), now),
        ),
        Effect.catchTag("BadAgentConfig", (error) =>
          Effect.logWarning(`skipping agent ${error.agentId}: bad config`, error.cause),
        ),
        Effect.catchTag("DbError", (error) =>
          Effect.logError(`screener alert for agent ${agent.agentId} failed: ${error.operation}`, error.cause),
        ),
      ),
    { discard: true },
  );
});

const spikes = (readings: ReadonlyArray<ScreenerReading>, history: History, rule: ScreenRule, now: number) =>
  readings.flatMap((reading): Hit[] => {
    if (!alertable(reading, rule.filter)) return [];
    const spike = evaluateSpike(history.get(reading.address)?.minutes ?? [], rule, now);
    return spike ? [{ reading, spike }] : [];
  });

/**
 * The strongest spikes outside their cooldown, at most `MAX_SCREENER_ALERTS`, in one message. The cooldown is the
 * agent's own `agent_alerts`: a failed send stores its error, so that pool can alert again next minute.
 */
const notifyScreener = Effect.fn("notifyScreener")(function* (
  agent: ScreenerAgent,
  cooldownMs: number,
  hits: ReadonlyArray<Hit>,
  now: number,
) {
  if (hits.length === 0) return;
  const db = yield* Db;
  const telegram = yield* Telegram;
  const { webUrl } = yield* AppConfig;
  const { agentId, userId } = agent;

  const target = yield* volumeTarget(agentId, userId);
  if (Option.isNone(target)) return;

  const cooling = yield* db.alertedPools(agentId, userId, new Date(now - cooldownMs));
  const fresh = hits
    .filter((hit) => !cooling.has(hit.reading.address))
    .toSorted((a, b) => b.spike.ratio - a.spike.ratio || 0);
  const sent = fresh.slice(0, MAX_SCREENER_ALERTS);
  if (sent.length === 0) return;

  const at = new Date(now);
  const ids = yield* db.recordAlerts(
    sent.map(({ reading, spike }) => ({ agentId, userId, poolAddress: reading.address, ...spike, at })),
  );
  const lines = sent.map(
    ({ reading, spike }): SpikeLine => ({
      name: reading.name,
      binStep: reading.binStep,
      poolAddress: reading.address,
      baselineMin: SCREENER_BASELINE,
      spike,
    }),
  );
  const { chatId, botToken } = target.value;
  yield* telegram
    .send(chatId, formatMessage(lines, fresh.length - sent.length), botToken, linkButtons(lines, webUrl))
    .pipe(
      Effect.matchEffect({
        onSuccess: () => db.markDelivered(ids),
        onFailure: (error) =>
          Effect.logWarning(`telegram send failed for agent ${agentId}`, error.cause).pipe(
            Effect.andThen(db.markFailed(ids, String(error.cause))),
          ),
      }),
    );
});
