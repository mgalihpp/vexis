import { MODEL_PRICES } from "@vexis/shared/office";
import { chatCompletions } from "./openai.ts";
import type { Provider } from "./provider.ts";

// OpenRouter routes one model to several upstream hosts at different rates. `max_price` (USD per million tokens) caps
// routing at the rate `MODEL_PRICES` bills, and `require_parameters` skips hosts that ignore `response_format`.
const base = chatCompletions("https://openrouter.ai/api/v1", { jsonMode: true });

export const openrouter: Provider = {
  build: (call) => {
    const request = base.build(call);
    const price = MODEL_PRICES.openrouter[call.model];
    return {
      ...request,
      body: {
        ...(request.body as object),
        provider: {
          require_parameters: true,
          ...(price && { max_price: { prompt: price.input, completion: price.output } }),
        },
      },
    };
  },
  read: base.read,
};
