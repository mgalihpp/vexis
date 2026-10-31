import { z } from "zod";

const SOL = "So11111111111111111111111111111111111111112";
const BTC = "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij";
const CACHE_MS = 30_000;

// lite-api needs no key; with JUPITER_API_KEY set, the keyed endpoint is used instead.
const key = process.env.JUPITER_API_KEY;
const API = key ? "https://api.jup.ag" : "https://lite-api.jup.ag";

const Prices = z.record(z.string(), z.object({ usdPrice: z.number() }).nullable());

let cached: { at: number; value: Promise<{ sol: number | null; btc: number | null }> } | undefined;

export function loadPrices() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = fetch(`${API}/price/v3?ids=${SOL},${BTC}`, { headers: key ? { "x-api-key": key } : {} })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Jupiter price ${res.status}`))))
    .then((json) => {
      const prices = Prices.parse(json);
      return { sol: prices[SOL]?.usdPrice ?? null, btc: prices[BTC]?.usdPrice ?? null };
    })
    .catch(() => ({ sol: null, btc: null }));
  cached = { at: Date.now(), value };
  return value;
}
