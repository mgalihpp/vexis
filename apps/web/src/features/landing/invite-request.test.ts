import { describe, expect, test } from "bun:test";
import { rateLimit } from "./invite-request";

const limit = { max: 3, windowMs: 1000 };

describe("rateLimit", () => {
  test.each([
    ["first request", [], 5000, true, [5000]],
    ["under the limit", [4200, 4500], 5000, true, [4200, 4500, 5000]],
    ["at the limit", [4200, 4500, 4800], 5000, false, [4200, 4500, 4800]],
    ["oldest slid out of the window", [4000, 4500, 4800], 5000, true, [4500, 4800, 5000]],
    ["all expired", [1000, 2000, 3000], 5000, true, [5000]],
    ["rejected requests are not counted", [4500, 4600, 4700], 4800, false, [4500, 4600, 4700]],
  ] as const)("%s", (_, times, now, ok, kept) => {
    expect(rateLimit(times, now, limit)).toEqual({ ok, times: [...kept] });
  });
});
