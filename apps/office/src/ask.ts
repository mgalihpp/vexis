import { budgetLeft, dailyCapUsd } from "@vexis/db/guardrails";
import {
  type AgentModel,
  type Guardrails,
  type LlmAgent,
  type MessageTone,
  type OfficeAgent,
  type OfficeModels,
  PROVIDER_LABEL,
  runCost,
} from "@vexis/db/office";
import type { OfficeConfigRow } from "@vexis/db/office-queries";
import type { PoolFilter } from "@vexis/db/screen";
import { Clock, Effect, Option, Result } from "effect";
import { AppConfig, llmKey } from "./config.ts";
import { parseDecision } from "./decision.ts";
import type { Prompt } from "./prompts/prompts.ts";
import { Db, type NewMessage } from "./services/db.ts";
import { Llm } from "./services/llm.ts";
import { OfficeState } from "./services/state.ts";

/** One office for one tick: its row, parsed config and the tick's clock. */
export type Office = {
  readonly row: OfficeConfigRow;
  readonly userId: string;
  readonly guardrails: Guardrails;
  readonly models: OfficeModels;
  /** The office's pool screen; null for a custom choice with no filter, which stops the Scout. */
  readonly filter: PoolFilter | null;
  readonly now: number;
};

export const say = (
  office: Office,
  agent: OfficeAgent,
  text: string,
  tone: MessageTone,
  extra: Partial<NewMessage> = {},
) =>
  Effect.gen(function* () {
    yield* (yield* Db).message(office.userId, { agent, text, tone, ...extra });
  });

/** Posts `text` at most once per UTC day per `key`, for a state that would otherwise repeat every minute. */
export const sayOnce = (office: Office, key: string, agent: OfficeAgent, text: string, tone: MessageTone) =>
  Effect.gen(function* () {
    if (yield* (yield* OfficeState).firstToday(`${office.userId}:${key}`, office.now)) {
      yield* say(office, agent, text, tone);
    }
  });

/** Today's LLM spend on the office's key source, and the cap for it. */
export const llmBudget = (office: Office) =>
  Effect.gen(function* () {
    const rows = yield* (yield* Db).spendToday(office.userId, new Date(office.now));
    const spent = rows.filter((r) => r.keySource === office.row.keySource).reduce((sum, r) => sum + r.usd, 0);
    return { spent, cap: dailyCapUsd(office.row.keySource, office.row.vexisDailyUsd, office.guardrails) };
  });

/** An agent cleared to call its model. */
export type Seat = { readonly agent: LlmAgent; readonly model: AgentModel; readonly apiKey: string };

/** None when the agent has no model, the day's budget is spent or there is no key; the last two tell the feed once. */
export const seat = (office: Office, agent: LlmAgent) =>
  Effect.gen(function* () {
    const model = office.models[agent];
    if (!model) return Option.none<Seat>();

    const { spent, cap } = yield* llmBudget(office);
    if (!budgetLeft(spent, cap)) {
      yield* sayOnce(
        office,
        "llm-budget",
        "manager",
        `Daily LLM budget used ($${spent.toFixed(2)} of $${cap.toFixed(2)}). Desks rest until 00:00 UTC.`,
        "warn",
      );
      return Option.none<Seat>();
    }

    const apiKey = llmKey(office.row, model.provider, (yield* AppConfig).vexisKeys);
    if (apiKey === null) {
      const whose = office.row.keySource === "vexis" ? "Vexis has" : "you saved";
      const label = PROVIDER_LABEL[model.provider];
      yield* sayOnce(office, `key-${agent}`, agent, `No ${label} key (${whose} none). Skipping.`, "warn");
      return Option.none<Seat>();
    }
    return Option.some<Seat>({ agent, model, apiKey });
  });

/**
 * Asks a seated agent its prompt and parses the reply. None when the call fails or the reply does not parse, which
 * is logged, never repaired. Every call made is one `office_runs` row.
 */
export const call = <I, A>(office: Office, { agent, model, apiKey }: Seat, prompt: Prompt<I, A>, input: I) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const label = PROVIDER_LABEL[model.provider];
    const started = yield* Clock.currentTimeMillis;
    const result = yield* (yield* Llm)
      .complete({
        agent,
        provider: model.provider,
        model: model.model,
        apiKey,
        system: prompt.system,
        user: prompt.user(input),
      })
      .pipe(Effect.result);
    const run = {
      agent,
      provider: model.provider,
      model: model.model,
      keySource: office.row.keySource,
      promptVersion: prompt.version,
      durationMs: (yield* Clock.currentTimeMillis) - started,
      at: new Date(office.now),
    };

    if (Result.isFailure(result)) {
      yield* db.insertRun(office.userId, { ...run, error: result.failure.message });
      yield* Effect.logWarning(`${agent} call failed for office ${office.userId}: ${result.failure.message}`);
      yield* sayOnce(office, `call-${agent}`, agent, `My ${label} call failed. I'll try again later.`, "warn");
      return Option.none<{ value: A; runId: string }>();
    }

    const { text, inputTokens, outputTokens } = result.success;
    const parsed = parseDecision(prompt.schema, text);
    const runId = yield* db.insertRun(office.userId, {
      ...run,
      inputTokens,
      outputTokens,
      costUsd: runCost(model.provider, model.model, inputTokens, outputTokens),
      error: parsed.ok ? null : `invalid output: ${parsed.error}`.slice(0, 500),
    });
    if (!parsed.ok) {
      yield* Effect.logWarning(`${agent} answered in the wrong shape for office ${office.userId}: ${parsed.error}`);
      return Option.none<{ value: A; runId: string }>();
    }
    return Option.some({ value: parsed.value, runId });
  });

/** `seat`, then `call`. */
export const ask = <I, A>(office: Office, agent: LlmAgent, prompt: Prompt<I, A>, input: I) =>
  Effect.gen(function* () {
    const seated = yield* seat(office, agent);
    if (Option.isNone(seated)) return Option.none<{ value: A; runId: string }>();
    return yield* call(office, seated.value, prompt, input);
  });
