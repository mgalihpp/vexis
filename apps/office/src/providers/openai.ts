import { z } from "zod";
import type { Provider } from "./provider.ts";

const Response = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number(), completion_tokens: z.number() }),
});

/**
 * The Chat Completions shape OpenAI, DeepSeek and Meta all serve. `jsonMode` sends `response_format: json_object`
 * where the provider documents it; `extra` holds a provider's own body fields.
 */
export const chatCompletions = (baseUrl: string, options: { jsonMode: boolean; extra?: object }): Provider => ({
  build: ({ model, apiKey, system, user }) => ({
    url: `${baseUrl}/chat/completions`,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(options.jsonMode && { response_format: { type: "json_object" } }),
      ...options.extra,
    },
  }),
  read: (body) => {
    const r = Response.parse(body);
    return {
      text: r.choices[0]?.message.content ?? "",
      inputTokens: r.usage.prompt_tokens,
      outputTokens: r.usage.completion_tokens,
    };
  },
});

export const openai = chatCompletions("https://api.openai.com/v1", { jsonMode: true });
