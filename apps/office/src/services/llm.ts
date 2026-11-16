import type { LlmAgent, LlmProvider } from "@vexis/shared/office";
import { Context, Effect, Layer } from "effect";
import { LlmError } from "../errors.ts";
import { claude } from "../providers/claude.ts";
import { deepseek } from "../providers/deepseek.ts";
import { meta } from "../providers/meta.ts";
import { openai } from "../providers/openai.ts";
import { openrouter } from "../providers/openrouter.ts";
import type { Completion, Provider } from "../providers/provider.ts";

const PROVIDERS: Record<LlmProvider, Provider> = { claude, openai, deepseek, meta, openrouter };

export type LlmRequest = {
  /** For logs and spans only; the provider never sees it. */
  readonly agent: LlmAgent;
  readonly provider: LlmProvider;
  readonly model: string;
  readonly apiKey: string;
  readonly system: string;
  readonly user: string;
};

/** One call to any provider, same shape for all. Errors are reduced to a message with the key scrubbed out. */
export class Llm extends Context.Service<Llm, { complete(request: LlmRequest): Effect.Effect<Completion, LlmError> }>()(
  "vexis/office/Llm",
) {
  static readonly layer = Layer.succeed(
    Llm,
    Llm.of({
      complete: ({ provider, model, apiKey, system, user }) => {
        const p = PROVIDERS[provider];
        const scrub = (text: string) => text.replaceAll(apiKey, "***");
        return Effect.tryPromise({
          try: async (signal) => {
            const call = p.build({ model, apiKey, system, user });
            const response = await fetch(call.url, {
              method: "POST",
              headers: call.headers,
              body: JSON.stringify(call.body),
              signal,
            });
            const body: unknown = await response.json().catch(() => null);
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)?.slice(0, 300)}`);
            return p.read(body);
          },
          catch: (cause) => new LlmError({ message: scrub(`${provider}/${model}: ${String(cause)}`) }),
        }).pipe(
          Effect.timeoutOrElse({
            duration: "90 seconds",
            orElse: () => Effect.fail(new LlmError({ message: `${provider}/${model}: timed out` })),
          }),
        );
      },
    }),
  );
}
