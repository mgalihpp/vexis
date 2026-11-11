import { z } from "zod";
import { type Cache, cached } from "../analytics/cache.server";
import { get } from "../portfolio/meteora.server";
import { loadTokenInfo } from "../portfolio/prices.server";
import { FLOOR, type PoolStats, type Screener, type ScreenerPool, type ScreenerToken, xShare } from "./screener";

const num = z.number();
const windows = z.object({ "30m": num, "1h": num, "2h": num, "4h": num, "12h": num, "24h": num });
const Token = z.object({
  address: z.string(),
  symbol: z.string(),
  is_verified: z.boolean().nullish(),
  freeze_authority_disabled: z.boolean().nullish(),
  holders: num.nullish(),
  market_cap: num.nullish(),
  price: num.nullish(),
});
const Pool = z.object({
  address: z.string(),
  name: z.string(),
  token_x: Token,
  token_y: Token,
  created_at: num,
  pool_config: z.object({ bin_step: num, base_fee_pct: num }),
  tvl: num,
  token_x_amount: num,
  token_y_amount: num,
  volume: windows,
  fees: windows,
  fee_tvl_ratio: windows,
  is_blacklisted: z.boolean(),
  launchpad: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
});
const Page = z.object({ total: num, data: z.array(Pool) });

const DiscoveryToken = z.object({
  address: z.string(),
  icon: z.string().nullish(),
  has_mint_authority: z.boolean().nullish(),
  organic_score: num.nullish(),
  top_holders_pct: num.nullish(),
});
const DiscoveryRow = z.object({
  pool_address: z.string(),
  token_x: DiscoveryToken,
  token_y: DiscoveryToken,
  active_tvl: num,
  fee_active_tvl_ratio: num,
  swap_count: num,
  unique_traders: num,
  unique_lps: num,
  open_positions: num,
  active_positions_pct: num,
  total_deposits: num,
  total_withdraws: num,
  net_deposits: num,
  volatility: num,
  pool_price_change_pct: num,
  volume_change_pct: num,
  price_trend: z.array(num),
});
type DiscoveryRow = z.infer<typeof DiscoveryRow>;
const DISCOVERY_URL = "https://pool-discovery-api.datapi.meteora.ag/pools";

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
 * The discovery API's 24h figures for the same pools, one request on its own host and budget. A failure or a row
 * that does not parse leaves those pools without stats instead of failing the screener.
 */
async function loadDiscovery(): Promise<Map<string, DiscoveryRow>> {
  const out = new Map<string, DiscoveryRow>();
  try {
    const url = new URL(DISCOVERY_URL);
    url.searchParams.set("page_size", String(PAGE_SIZE));
    url.searchParams.set("timeframe", "24h");
    url.searchParams.set("filter_by", `pool_type=dlmm && tvl>=${FLOOR.tvl} && volume>=${FLOOR.volume}`);
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`discovery API ${res.status}`);
    const body = z.object({ data: z.array(z.unknown()) }).parse(await res.json());
    for (const raw of body.data) {
      const row = DiscoveryRow.safeParse(raw);
      if (row.success) out.set(row.data.pool_address, row.data);
    }
  } catch (err) {
    console.warn("[screener] discovery stats unavailable:", err instanceof Error ? err.message : err);
  }
  return out;
}

const stats = (d: DiscoveryRow): PoolStats => ({
  activeTvl: d.active_tvl,
  feeActiveTvl: d.fee_active_tvl_ratio,
  swaps: d.swap_count,
  traders: d.unique_traders,
  lps: d.unique_lps,
  openPositions: d.open_positions,
  inRangePct: d.active_positions_pct,
  deposits: d.total_deposits,
  withdrawals: d.total_withdraws,
  netDeposits: d.net_deposits,
  volatility: d.volatility,
  priceChange: d.pool_price_change_pct || null,
  volumeChange: d.volume_change_pct || null,
  trend: d.price_trend,
});

/**
 * Every pool above the floor in one datapi request a minute, shared by all viewers. Minimums, bin step, search and
 * sorting all happen in the browser, so changing a filter costs no request.
 */
export const loadScreener = (): Promise<Screener> =>
  cached(cache, "all", TTL_MS, async () => {
    const [page, discovery] = await Promise.all([
      get("/pools", Page, {
        page_size: PAGE_SIZE,
        sort_by: "tvl:desc",
        filter_by: `tvl>=${FLOOR.tvl} && volume_24h>=${FLOOR.volume}`,
      }),
      loadDiscovery(),
    ]);
    const known = new Map<string, z.infer<typeof DiscoveryToken>>();
    for (const d of discovery.values()) for (const t of [d.token_x, d.token_y]) known.set(t.address, t);
    await loadIcons(
      page.data.flatMap((p) => [p.token_x.address, p.token_y.address]).filter((m) => !known.get(m)?.icon),
    );
    const token = (t: z.infer<typeof Token>): ScreenerToken => {
      const d = known.get(t.address);
      return {
        mint: t.address,
        symbol: t.symbol,
        icon: d?.icon || icons.get(t.address)?.icon || null,
        verified: t.is_verified ?? false,
        freezable: t.freeze_authority_disabled === false,
        mintable: d?.has_mint_authority === true,
        marketCap: t.market_cap || null,
        holders: t.holders ?? null,
        organic: d?.organic_score ?? null,
        topHolders: d?.top_holders_pct ?? null,
      };
    };
    const pools = page.data.map((p): ScreenerPool => {
      const d = discovery.get(p.address);
      return {
        address: p.address,
        name: p.name,
        binStep: p.pool_config.bin_step,
        baseFeePct: p.pool_config.base_fee_pct,
        tvl: p.tvl,
        volume: p.volume,
        fees24h: p.fees["24h"],
        feeTvl: p.fee_tvl_ratio,
        createdAt: ms(p.created_at),
        blacklisted: p.is_blacklisted,
        tags: p.tags ?? [],
        launchpad: p.launchpad || null,
        tokenX: token(p.token_x),
        tokenY: token(p.token_y),
        xShare: xShare(
          p.token_x_amount * (p.token_x.price ?? Number.NaN),
          p.token_y_amount * (p.token_y.price ?? Number.NaN),
        ),
        stats: d ? stats(d) : null,
      };
    });
    return { pools, at: Date.now(), total: page.total };
  });
