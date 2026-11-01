import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ClosedPosition } from "./portfolio";

/** One wallet's closed positions per pool, tagged with the pool's `lastClosedAt` when they were fetched. */
export type PoolCache = Map<string, { lastClosedAt: number | null; positions: ClosedPosition[] }>;

export interface ClosedPoolRef {
  pool: string;
  lastClosedAt: number | null;
}

const isFresh = (cache: PoolCache, p: ClosedPoolRef) => cache.get(p.pool)?.lastClosedAt === p.lastClosedAt;

/** Pools whose cached positions are missing or older than their latest close, newest close first. */
export const stalePools = <P extends ClosedPoolRef>(pools: P[], cache: PoolCache): P[] =>
  pools.filter((p) => !isFresh(cache, p)).sort((a, b) => (b.lastClosedAt ?? 0) - (a.lastClosedAt ?? 0));

export const freshCount = (pools: ClosedPoolRef[], cache: PoolCache) => pools.filter((p) => isFresh(cache, p)).length;

const Amounts = z.object({ deposit: z.number(), withdraw: z.number(), fees: z.number(), pnl: z.number() });
const CacheFile = z.object({
  version: z.literal(1),
  pools: z.record(
    z.string(),
    z.object({
      lastClosedAt: z.number().nullable(),
      positions: z.array(
        z.object({
          address: z.string(),
          pool: z.string(),
          pair: z.string(),
          openedAt: z.number(),
          closedAt: z.number(),
          sol: Amounts,
          usd: Amounts,
        }),
      ),
    }),
  ),
});

const cacheFile = (dir: string, wallet: string) => join(dir, `${wallet}.json`);

/** A missing, corrupt or older-format file reads as an empty cache; it is only a cache. */
export async function readPoolCache(dir: string, wallet: string): Promise<PoolCache> {
  try {
    const parsed = CacheFile.safeParse(JSON.parse(await readFile(cacheFile(dir, wallet), "utf8")));
    return new Map(parsed.success ? Object.entries(parsed.data.pools) : []);
  } catch {
    return new Map();
  }
}

export async function writePoolCache(dir: string, wallet: string, cache: PoolCache): Promise<void> {
  await mkdir(dir, { recursive: true });
  const file = cacheFile(dir, wallet);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify({ version: 1, pools: Object.fromEntries(cache) }));
  await rename(tmp, file);
}
