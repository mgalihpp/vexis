import { z } from "zod";
import { type TokenAudit, tokenRisks } from "./portfolio";

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

const JupToken = z.object({
  id: z.string(),
  organicScore: z.number().nullish(),
  isVerified: z.boolean().nullish(),
  mintAuthority: z.string().nullish(),
  audit: z
    .object({
      isSus: z.boolean().nullish(),
      mintAuthorityDisabled: z.boolean().nullish(),
      freezeAuthorityDisabled: z.boolean().nullish(),
      topHoldersPercentage: z.number().nullish(),
      devMints: z.number().nullish(),
    })
    .nullish(),
});

export interface TokenInfo {
  verified: boolean | null;
  organicScore: number | null;
  risks: string[];
}

// The search endpoint takes up to 100 comma-separated mints per request.
const SEARCH_BATCH = 100;

/** Organic score and audit warnings per mint. Missing mints, or a failed request, are simply absent. */
export async function loadTokenInfo(mints: string[]): Promise<Map<string, TokenInfo>> {
  const out = new Map<string, TokenInfo>();
  const unique = [...new Set(mints)];
  for (let i = 0; i < unique.length; i += SEARCH_BATCH) {
    const query = unique.slice(i, i + SEARCH_BATCH).join(",");
    try {
      const res = await fetch(`${API}/tokens/v2/search?query=${query}`, { headers: key ? { "x-api-key": key } : {} });
      if (!res.ok) continue;
      for (const t of z.array(JupToken).parse(await res.json())) {
        const audit: TokenAudit = { ...t.audit, mintAuthority: t.mintAuthority };
        out.set(t.id, {
          verified: t.isVerified ?? null,
          organicScore: t.organicScore ?? null,
          risks: tokenRisks(audit),
        });
      }
    } catch {
      // Scores only decorate the pool row; the positions must load without them.
    }
  }
  return out;
}
