// Pure, client-safe: turns a wallet address into a stable set of avatar traits. The same address always gets the same
// character, and different addresses spread across all the combinations.

export const BODY_COUNT = 3;
export const EYE_COUNT = 4;
export const MOUTH_COUNT = 3;
export const EAR_COUNT = 3;
export const ACCESSORY_COUNT = 6;
export const BACKGROUND_COUNT = 4;

/** Rarity tiers, most common first. Chosen by the address hash, so a wallet's rarity never changes. */
export const RARITIES = ["common", "rare", "epic", "legendary"] as const;
export type Rarity = (typeof RARITIES)[number];

export interface AvatarTraits {
  hue: number;
  body: number;
  eyes: number;
  mouth: number;
  ears: number;
  accessory: number;
  background: number;
  rarity: Rarity;
}

/** FNV-1a, 32-bit. Small, fast, and well spread for short strings. */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 0 to 99 maps to a tier: 60% common, 25% rare, 12% epic, 3% legendary. */
export function rarityOf(roll: number): Rarity {
  if (roll < 60) return "common";
  if (roll < 85) return "rare";
  if (roll < 97) return "epic";
  return "legendary";
}

export function avatarTraits(address: string): AvatarTraits {
  // Each trait takes its own slice of the hash so they vary independently.
  const h = hash32(address);
  return {
    hue: h % 360,
    body: (h >>> 8) % BODY_COUNT,
    eyes: (h >>> 12) % EYE_COUNT,
    mouth: (h >>> 16) % MOUTH_COUNT,
    ears: (h >>> 20) % EAR_COUNT,
    accessory: (h >>> 2) % ACCESSORY_COUNT,
    background: (h >>> 6) % BACKGROUND_COUNT,
    rarity: rarityOf(hash32(`rarity:${address}`) % 100),
  };
}
