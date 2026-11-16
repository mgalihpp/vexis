import { type KeySource, LLM_PROVIDERS, type LlmProvider } from "@vexis/db/office";
import { decryptSecret } from "@vexis/db/secret";
import { Config, Context, Effect, Layer, Option, Redacted } from "effect";

/** Env var holding Vexis's own key per provider, for offices on key source `vexis`. */
export const VEXIS_KEY_ENV: Record<LlmProvider, string> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  meta: "META_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

const key32 = (name: string) =>
  Config.Redacted(name).pipe(
    Effect.flatMap((value) =>
      Buffer.from(Redacted.value(value), "base64").length === 32
        ? Effect.void
        : Effect.die(new Error(`${name} must be 32 bytes, base64 encoded`)),
    ),
  );

/** Vexis's LLM keys. A provider with no key here cannot run on key source `vexis`. */
export class AppConfig extends Context.Service<
  AppConfig,
  { readonly vexisKeys: Partial<Record<LlmProvider, Redacted.Redacted>> }
>()("vexis/office/AppConfig") {
  static readonly layer = Layer.effect(
    AppConfig,
    Effect.gen(function* () {
      // Checked up front: own LLM keys decrypt with the first, wallet RPC URLs with the second.
      yield* key32("TOKEN_ENC_KEY");
      yield* key32("WALLET_ENC_KEY");
      const vexisKeys: Partial<Record<LlmProvider, Redacted.Redacted>> = {};
      for (const provider of LLM_PROVIDERS) {
        const key = yield* Config.option(Config.Redacted(VEXIS_KEY_ENV[provider]));
        if (Option.isSome(key)) vexisKeys[provider] = key.value;
      }
      return AppConfig.of({ vexisKeys });
    }),
  );
}

/**
 * The API key an office calls `provider` with: Vexis's own for key source `vexis`, the owner's (encrypted with
 * `TOKEN_ENC_KEY`) for `own`. Null when there is none or it does not decrypt.
 */
export function llmKey(
  office: { readonly keySource: KeySource; readonly llmKeys: Partial<Record<LlmProvider, string>> },
  provider: LlmProvider,
  vexisKeys: Partial<Record<LlmProvider, Redacted.Redacted>>,
) {
  if (office.keySource === "vexis") {
    const key = vexisKeys[provider];
    return key ? Redacted.value(key) : null;
  }
  const blob = office.llmKeys[provider];
  if (!blob) return null;
  try {
    return decryptSecret(blob, "TOKEN_ENC_KEY");
  } catch {
    return null;
  }
}
