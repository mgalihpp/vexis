import { chatCompletions } from "./openai.ts";

// Meta Model API (dev.meta.ai, checked 2026-11-15): OpenAI-compatible Chat Completions at api.meta.ai/v1 with a Bearer
// key and `json_object` JSON mode. The Muse models always reason, so effort is kept low for these short answers.
export const meta = chatCompletions("https://api.meta.ai/v1", { jsonMode: true, extra: { reasoning_effort: "low" } });
