import { chatCompletions } from "./openai.ts";

// JSON Output blanks a reply that is not JSON, and cuts one that runs past max_tokens, so the cap is generous.
export const deepseek = chatCompletions("https://api.deepseek.com", { jsonMode: true, extra: { max_tokens: 4096 } });
