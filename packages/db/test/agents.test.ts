import { describe, expect, test } from "bun:test";
import { defaultAgentConfig, parseAgentConfig } from "../src/agents.ts";

describe("volume-watch config", () => {
  test("defaults match the volume-watch rule", () => {
    expect(defaultAgentConfig("volume-watch")).toEqual({
      mult: 3,
      baseline: 30,
      minUsd: 5000,
      intervalSec: 60,
      cooldownSec: 300,
    });
  });

  test("fills missing fields and rejects bad ones", () => {
    expect(parseAgentConfig("volume-watch", { mult: 5 }).mult).toBe(5);
    expect(parseAgentConfig("volume-watch", { mult: 5 }).baseline).toBe(30);
    expect(() => parseAgentConfig("volume-watch", { mult: 0 })).toThrow();
    expect(() => parseAgentConfig("volume-watch", { baseline: 1.5 })).toThrow();
  });
});
