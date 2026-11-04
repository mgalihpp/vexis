import { describe, expect, test } from "bun:test";
import {
  ACCESSORY_COUNT,
  avatarTraits,
  BACKGROUND_COUNT,
  BODY_COUNT,
  EAR_COUNT,
  EYE_COUNT,
  hash32,
  MOUTH_COUNT,
  rarityOf,
} from "./wallet-avatar";

describe("avatarTraits", () => {
  test("the same address always gets the same character", () => {
    expect(avatarTraits("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin")).toEqual(
      avatarTraits("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"),
    );
  });

  test("traits stay within the drawn variants", () => {
    for (let i = 0; i < 500; i++) {
      const t = avatarTraits(`wallet-${i}`);
      expect(t.hue).toBeGreaterThanOrEqual(0);
      expect(t.hue).toBeLessThan(360);
      expect(t.body).toBeLessThan(BODY_COUNT);
      expect(t.eyes).toBeLessThan(EYE_COUNT);
      expect(t.mouth).toBeLessThan(MOUTH_COUNT);
      expect(t.ears).toBeLessThan(EAR_COUNT);
    }
  });

  test("different addresses get different characters", () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => JSON.stringify(avatarTraits(`wallet-${i}`))));
    expect(seen.size).toBeGreaterThan(150);
  });

  test("hash32 is a 32-bit unsigned value", () => {
    const h = hash32("abc");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  test("accessory and background stay within their variants", () => {
    for (let i = 0; i < 500; i++) {
      const t = avatarTraits(`wallet-${i}`);
      expect(t.accessory).toBeLessThan(ACCESSORY_COUNT);
      expect(t.background).toBeLessThan(BACKGROUND_COUNT);
    }
  });

  test("rarity thresholds match the stated odds", () => {
    expect(rarityOf(0)).toBe("common");
    expect(rarityOf(59)).toBe("common");
    expect(rarityOf(60)).toBe("rare");
    expect(rarityOf(85)).toBe("epic");
    expect(rarityOf(97)).toBe("legendary");
    expect(rarityOf(99)).toBe("legendary");
  });
});
