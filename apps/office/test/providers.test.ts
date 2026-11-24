import { describe, expect, it } from "bun:test";
import { claude } from "../src/providers/claude.ts";
import { deepseek } from "../src/providers/deepseek.ts";
import { meta } from "../src/providers/meta.ts";
import { openai } from "../src/providers/openai.ts";
import { openrouter } from "../src/providers/openrouter.ts";

const call = { model: "m", apiKey: "k", system: "s", user: "u" };
const chat = { choices: [{ message: { content: "hi" } }], usage: { prompt_tokens: 11, completion_tokens: 7 } };

describe("openrouter", () => {
  it("caps routing at the listed price and needs JSON mode", () => {
    const { url, body } = openrouter.build({ ...call, model: "x-ai/grok-4.7" });
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body).toMatchObject({
      model: "x-ai/grok-4.7",
      response_format: { type: "json_object" },
      provider: { require_parameters: true, max_price: { prompt: 2, completion: 6 } },
    });
  });
});

describe("Chat Completions providers", () => {
  it.each([
    ["openai", openai, "https://api.openai.com/v1/chat/completions", {}],
    ["deepseek", deepseek, "https://api.deepseek.com/chat/completions", { max_tokens: 4096 }],
    ["meta", meta, "https://api.meta.ai/v1/chat/completions", { reasoning_effort: "low" }],
  ] as const)("%s sends a Bearer key and JSON mode", (_, provider, url, extra) => {
    const request = provider.build(call);
    expect(request.url).toBe(url);
    expect(request.headers.authorization).toBe("Bearer k");
    expect(request.body).toEqual({
      model: "m",
      messages: [
        { role: "system", content: "s" },
        { role: "user", content: "u" },
      ],
      response_format: { type: "json_object" },
      ...extra,
    });
  });

  it.each([
    ["openai", openai],
    ["deepseek", deepseek],
    ["meta", meta],
    ["openrouter", openrouter],
  ] as const)("%s reads the text and bills prompt tokens as input", (_, provider) => {
    expect(provider.read(chat)).toEqual({ text: "hi", inputTokens: 11, outputTokens: 7 });
    expect(provider.read({ ...chat, choices: [{ message: { content: null } }] }).text).toBe("");
    expect(() => provider.read({ choices: [], usage: chat.usage })).toThrow();
    expect(() => provider.read({ choices: chat.choices })).toThrow();
  });
});

describe("claude", () => {
  it("sends the key in x-api-key with low effort", () => {
    const request = claude.build(call);
    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["x-api-key"]).toBe("k");
    expect(request.body).toEqual({
      model: "m",
      max_tokens: 4096,
      system: "s",
      messages: [{ role: "user", content: "u" }],
      output_config: { effort: "low" },
    });
  });

  it("joins the text blocks and keeps input and output tokens apart", () => {
    const body = {
      content: [{ type: "thinking" }, { type: "text", text: '{"a":' }, { type: "text", text: "1}" }],
      usage: { input_tokens: 11, output_tokens: 7 },
    };
    expect(claude.read(body)).toEqual({ text: '{"a":1}', inputTokens: 11, outputTokens: 7 });
    expect(() => claude.read({ content: [] })).toThrow();
  });
});
