import { describe, expect, it } from "bun:test";
import { isHuman, signHuman } from "./human.server";

describe("human cookie", () => {
  const now = Date.UTC(2026, 10, 22);
  const cookie = signHuman("secret", now);

  it("accepts its own cookie until it expires and refuses everything else", () => {
    expect(isHuman("secret", cookie, now + 60_000)).toBe(true);
    expect(isHuman("secret", cookie, now + 25 * 3600_000)).toBe(false);
    expect(isHuman("other", cookie, now)).toBe(false);
    const [exp, sig] = cookie.split(".");
    expect(isHuman("secret", `${Number(exp) + 99999}.${sig}`, now)).toBe(false);
    expect(isHuman("secret", undefined, now)).toBe(false);
    expect(isHuman("secret", "garbage", now)).toBe(false);
  });
});
