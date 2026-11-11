import { z } from "zod";
import { type Cache, cached } from "../analytics/cache.server";
import { get } from "../portfolio/meteora.server";
import { loadTokenInfo } from "../portfolio/prices.server";
import { FLOOR, type Screener, type ScreenerPool, type ScreenerToken } from "./screener";

const num = z.number();
const windows = z.object({ "30m": num, "1h": num, "2h": num, "4h": num, "12h": num, "24h": num });
const Token = z.object({
  address: z.string(),
  symbol: z.string(),
  is_verified: z.boolean().nullish(),
  freeze_authority_disabled: z.boolean().nullish(),
});
const Pool = z.object({
  address: z.string(),
  name: z.string(),
  token_x: Token,
  token_y: Token,
  created_at: num,
  pool_config: z.object({ bin_step: num, base_fee_pct: num }),
  tvl: num,
  volume: windows,
  fees: windows,
  fee_tvl_ratio: windows,
  is_blacklisted: z.boolean(),
  launchpad: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
});
const Page = z.object({ total: num, data: z.array(Pool) });

// The API's page size limit. One page holds every pool above the floor (about 620 in November 2026).
const PAGE_SIZE = 1000;
const TTL_MS = 60_000;
const ICON_TTL_MS = 6 * 3_600_000;

const cache: Cache<Screener> = new Map();
const icons = new Map<string, { at: number; icon: string | null }>();

/** Token icons from Jupiter, 100 mints a request. Icons do not change, so only mints not seen for 6h are asked for. */
async function loadIcons(mints: string[]) {
  const now = Date.now();
  const missing = [...new Set(mints)].filter((m) => now - (icons.get(m)?.at ?? 0) > ICON_TTL_MS);
  if (missing.length === 0) return;
  const info = await loadTokenInfo(missing);
  for (const mint of missing) icons.set(mint, { at: now, icon: info.get(mint)?.icon ?? icons.get(mint)?.icon ?? null });
}

const ms = (t: number) => (t < 1e12 ? t * 1000 : t);

/**
 * Every pool above the floor in one datapi request a minute, shared by all viewers. Minimums, bin step, search and
 * sorting all happen in the browser, so changing a filter costs no request.
 */
export const loadScreener = (): Promise<Screener> =>
  cached(cache, "all", TTL_MS, async () => {
    const page = await get("/pools", Page, {
      page_size: PAGE_SIZE,
      sort_by: "tvl:desc",
      filter_by: `tvl>=${FLOOR.tvl} && volume_24h>=${FLOOR.volume}`,
    });
    await loadIcons(page.data.flatMap((p) => [p.token_x.address, p.token_y.address]));
    const token = (t: z.infer<typeof Token>): ScreenerToken => ({
      mint: t.address,
      symbol: t.symbol,
      icon: icons.get(t.address)?.icon ?? null,
      verified: t.is_verified ?? false,
      freezable: t.freeze_authority_disabled === false,
    });
    const pools = page.data.map(
      (p): ScreenerPool => ({
        address: p.address,
        name: p.name,
        binStep: p.pool_config.bin_step,
        baseFeePct: p.pool_config.base_fee_pct,
        tvl: p.tvl,
        volume24h: p.volume["24h"],
        fees24h: p.fees["24h"],
        feeTvl: p.fee_tvl_ratio,
        createdAt: ms(p.created_at),
        blacklisted: p.is_blacklisted,
        tags: p.tags ?? [],
        launchpad: p.launchpad || null,
        tokenX: token(p.token_x),
        tokenY: token(p.token_y),
      }),
    );
    return { pools, at: Date.now(), total: page.total };
  });
