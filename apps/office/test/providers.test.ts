import { describe, expect, it } from "bun:test";
import { openrouter } from "../src/providers/openrouter.ts";

describe("openrouter", () => {
  it("caps routing at the listed price and needs JSON mode", () => {
    const { url, body } = openrouter.build({ model: "x-ai/grok-4.7", apiKey: "k", system: "s", user: "u" });
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body).toMatchObject({
      model: "x-ai/grok-4.7",
      response_format: { type: "json_object" },
      provider: { require_parameters: true, max_price: { prompt: 2, completion: 6 } },
    });
  });
});
