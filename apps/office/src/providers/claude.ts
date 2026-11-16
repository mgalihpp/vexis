import { z } from "zod";
import type { Provider } from "./provider.ts";

const Response = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }),
});

/**
 * Anthropic Messages API. Thinking cannot be turned off on the current models, so effort is set low: these are short
 * structured answers, and thinking tokens bill as output.
 */
export const claude: Provider = {
  build: ({ model, apiKey, system, user }) => ({
    url: "https://api.anthropic.com/v1/messages",
    headers: { "x-api-key": apiKey, "anthropic-version": "2026-10-21", "content-type": "application/json" },
    body: {
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
      output_config: { effort: "low" },
    },
  }),
  read: (body) => {
    const r = Response.parse(body);
    return {
      text: r.content.flatMap((b) => (b.type === "text" && b.text ? [b.text] : [])).join(""),
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
    };
  },
};
