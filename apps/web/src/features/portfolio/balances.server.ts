import { z } from "zod";
import { type BalanceToken, balanceMint, type TokenBalance, unknownToken, type WalletBalances } from "./balances";
import { jupiter, loadTokenInfo } from "./prices.server";

const CACHE_MS = 30_000;

const Balances = z.record(z.string(), z.object({ uiAmount: z.number() }));

const cache = new Map<string, { at: number; value: Promise<WalletBalances> }>();

async function fetchBalances(wallet: string): Promise<WalletBalances> {
  const res = await jupiter(`/ultra/v1/balances/${wallet}`);
  if (!res.ok) throw new Error(`Jupiter balances ${res.status}`);
  const balances: TokenBalance[] = Object.entries(Balances.parse(await res.json()))
    .map(([key, b]) => ({ mint: balanceMint(key), amount: b.uiAmount }))
    .filter((b) => b.amount > 0);
  const info = await loadTokenInfo(balances.map((b) => b.mint));
  const tokens = [...info].map(([mint, t]): BalanceToken => {
    const fallback = unknownToken(mint);
    return {
      mint,
      symbol: t.symbol ?? fallback.symbol,
      name: t.name ?? fallback.name,
      icon: t.icon,
      verified: t.verified === true,
      organicScore: t.organicScore,
      price: t.usdPrice,
      fdv: t.fdv,
      priceChange24h: t.priceChange24h,
    };
  });
  return { balances, tokens };
}

/** Non-zero balances and their Jupiter token info, cached 30 s per wallet. */
export function loadBalances(wallet: string): Promise<WalletBalances> {
  const now = Date.now();
  for (const [w, entry] of cache) if (now - entry.at >= CACHE_MS) cache.delete(w);
  const hit = cache.get(wallet);
  if (hit) return hit.value;
  const value = fetchBalances(wallet);
  cache.set(wallet, { at: now, value });
  value.catch(() => cache.delete(wallet));
  return value;
}
