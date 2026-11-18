import { createRequire } from "node:module";
import { Connection, type GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { get } from "../portfolio/meteora.server";
import { type Cache, cached } from "./cache.server";
import {
  filterWallets,
  inRangeStatus,
  type PoolTotals,
  sortByLiquidity,
  sumKnown,
  TRACKED_PAGE_SIZES,
  TRACKED_REFRESH_MS,
  type TrackedPageSize,
  type TrackedPosition,
  type TrackedResult,
  type TrackedSort,
  type TrackedWallet,
  type WalletFilter,
} from "./tracked";

// The DLMM program. Every position account is owned by it, and the filters below select one pool's positions.
const DLMM_PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");

// The SDK exports the account filters. Load its CJS build like analytics does.
interface DlmmSdk {
  positionV2Filter: () => GetProgramAccountsFilter;
  positionLbPairFilter: (lbPair: PublicKey) => GetProgramAccountsFilter;
}
const sdkModule: unknown = createRequire(import.meta.url)("@meteora-ag/dlmm");
const sdk = ((sdkModule as { default?: unknown }).default ?? sdkModule) as DlmmSdk;

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC);

// Each wallet on a page costs one Meteora call, so the page size caps the cost of one request.
const SCAN_CACHE_MS = 5 * 60_000;
const DETAIL_CACHE_MS = 60_000;
const PNL_CONCURRENCY = 4;
const PNL_MAX_PAGES = 20;

const maybeNum = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v) => (v == null || v === "" ? null : Number(v)));

const TokenAmount = z.object({ amount: maybeNum, amountSol: maybeNum, usd: maybeNum }).nullish();
const Pair = z
  .object({
    tokenX: TokenAmount,
    tokenY: TokenAmount,
    total: z.object({ usd: maybeNum, sol: maybeNum }).nullish(),
  })
  .nullish();

// Only the fields the section shows; anything else Meteora sends is dropped by zod.
const PnlRow = z.object({
  positionAddress: z.string(),
  createdAt: z.number().nullish(),
  minPrice: maybeNum,
  maxPrice: maybeNum,
  poolActiveBinId: z.number().nullish(),
  isOutOfRange: z.boolean().nullish(),
  allTimeDeposits: Pair,
  allTimeFees: Pair,
  pnlUsd: maybeNum,
  pnlSol: maybeNum,
  unrealizedPnl: z
    .object({
      balances: maybeNum,
      balancesSol: maybeNum,
      unclaimedFeeTokenX: TokenAmount,
      unclaimedFeeTokenY: TokenAmount,
    })
    .nullish(),
});
type PnlRow = z.infer<typeof PnlRow>;

const PnlPage = z.object({ hasNext: z.boolean(), positions: z.array(PnlRow) });

/** One open position as read on-chain. Bins come from the chain, so they are right even when Meteora has no detail. */
interface OnChainPosition {
  address: string;
  owner: string;
  lowerBinId: number;
  upperBinId: number;
}

interface OwnerGroup {
  owner: string;
  /** Latest on-chain update across the owner's positions, in seconds. Used to order wallets newest first. */
  lastUpdatedAt: number;
  positions: OnChainPosition[];
}

interface Scan {
  at: number;
  groups: OwnerGroup[];
}

// PositionV2 byte offsets (8-byte discriminator, lb_pair, owner, then 70-entry share, reward and fee arrays).
// A position account is 8,120 bytes and busy pools hold thousands, so the scan asks the RPC for only these fields:
// fetching whole accounts for a 3,000-position pool took the 1 GB VPS past 500 MB and got the server OOM-killed.
const OWNER_SLICE = { offset: 40, length: 32 };
const BINS_SLICE = { offset: 7912, length: 16 }; // lower_bin_id i32, upper_bin_id i32, last_updated_at i64

/** Every open position in the pool, grouped by owner and ordered by latest activity. */
async function scanOwners(pool: string): Promise<OwnerGroup[]> {
  const filters = [sdk.positionV2Filter(), sdk.positionLbPairFilter(new PublicKey(pool))];
  const [owners, bins] = await Promise.all([
    connection.getProgramAccounts(DLMM_PROGRAM, { filters, dataSlice: OWNER_SLICE }),
    connection.getProgramAccounts(DLMM_PROGRAM, { filters, dataSlice: BINS_SLICE }),
  ]);
  const binsByAddress = new Map(bins.map(({ pubkey, account }) => [pubkey.toBase58(), Buffer.from(account.data)]));
  const groups = new Map<string, OwnerGroup>();
  for (const { pubkey, account } of owners) {
    const address = pubkey.toBase58();
    const b = binsByAddress.get(address);
    // A position opened or closed between the two reads is in only one of them; it shows up on the next scan.
    if (!b || b.length < BINS_SLICE.length || account.data.length < OWNER_SLICE.length) continue;
    const owner = new PublicKey(account.data).toBase58();
    const updated = Number(b.readBigInt64LE(8));
    const position: OnChainPosition = { address, owner, lowerBinId: b.readInt32LE(0), upperBinId: b.readInt32LE(4) };
    const group = groups.get(owner);
    if (group) {
      group.positions.push(position);
      group.lastUpdatedAt = Math.max(group.lastUpdatedAt, updated);
    } else {
      groups.set(owner, { owner, lastUpdatedAt: updated, positions: [position] });
    }
  }
  return [...groups.values()].sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt || a.owner.localeCompare(b.owner));
}

/** Meteora's open-position detail for one owner in one pool, every page. Null when the request fails. */
async function fetchOwnerDetail(pool: string, owner: string, background = false): Promise<PnlRow[] | null> {
  try {
    const out: PnlRow[] = [];
    for (let page = 1; page <= PNL_MAX_PAGES; page++) {
      const params = { user: owner, status: "open", page, page_size: 100 };
      const r = await get(`/positions/${pool}/pnl`, PnlPage, params, { background });
      out.push(...r.positions);
      if (!r.hasNext) break;
    }
    return out;
  } catch {
    return null;
  }
}

const scanCache: Cache<Scan> = new Map();
const detailCache: Cache<PnlRow[] | null> = new Map();

const scanFor = (pool: string) =>
  cached(scanCache, pool, SCAN_CACHE_MS, async () => ({ at: Date.now(), groups: await scanOwners(pool) }));

const detailFor = (pool: string, owner: string) =>
  cached(detailCache, `${pool}:${owner}`, DETAIL_CACHE_MS, () => fetchOwnerDetail(pool, owner));

/**
 * Meteora detail for every wallet in the pool, so fees and PnL can be totaled across pages. One job per pool and
 * scan: a new scan starts a new job and the old one stops at its next wallet. It runs at background priority, so a
 * busy pool (thousands of wallets) cannot starve open pages of the shared Meteora budget, and it puts only finished
 * results into `detailCache`, so a page never waits on a request the job has parked until the next window.
 */
interface TotalsJob {
  scanAt: number;
  total: number;
  rows: Map<string, PnlRow[] | null>;
  running: boolean;
}

const totalsJobs = new Map<string, TotalsJob>();

function totalsJobFor(pool: string, scan: Scan): TotalsJob {
  const current = totalsJobs.get(pool);
  if (current?.scanAt === scan.at) return current;
  const job: TotalsJob = { scanAt: scan.at, total: scan.groups.length, rows: new Map(), running: true };
  totalsJobs.set(pool, job);
  const owners = scan.groups.map((g) => g.owner);
  let next = 0;
  const worker = async () => {
    while (next < owners.length && totalsJobs.get(pool) === job) {
      const owner = owners[next++];
      if (owner === undefined) break;
      const key = `${pool}:${owner}`;
      const hit = detailCache.get(key);
      if (hit && Date.now() - hit.at < DETAIL_CACHE_MS) {
        job.rows.set(owner, await hit.value);
        continue;
      }
      const rows = await fetchOwnerDetail(pool, owner, true);
      if (rows) detailCache.set(key, { at: Date.now(), value: Promise.resolve(rows) });
      job.rows.set(owner, rows);
    }
  };
  void Promise.all(Array.from({ length: Math.min(PNL_CONCURRENCY, owners.length) }, worker)).finally(() => {
    job.running = false;
  });
  return job;
}

function poolTotals(job: TotalsJob): PoolTotals {
  const rows = [...job.rows.values()].flatMap((r) => r ?? []);
  let failed = 0;
  for (const r of job.rows.values()) if (r === null) failed++;
  return {
    feesUsd: sumKnown(rows.map((r) => r.allTimeFees?.total?.usd ?? null)),
    feesSol: sumKnown(rows.map((r) => r.allTimeFees?.total?.sol ?? null)),
    pnlUsd: sumKnown(rows.map((r) => r.pnlUsd)),
    pnlSol: sumKnown(rows.map((r) => r.pnlSol)),
    loaded: job.rows.size,
    total: job.total,
    failed,
    running: job.running,
  };
}

const ms = (t: number) => (t < 1e12 ? t * 1000 : t);

function buildPosition(p: OnChainPosition, row: PnlRow | undefined): TrackedPosition {
  const u = row?.unrealizedPnl;
  return {
    address: p.address,
    owner: p.owner,
    createdAt: row?.createdAt == null ? null : ms(row.createdAt),
    lowerBinId: p.lowerBinId,
    upperBinId: p.upperBinId,
    activeBinId: row?.poolActiveBinId ?? null,
    minPrice: row?.minPrice ?? null,
    maxPrice: row?.maxPrice ?? null,
    inRange: row
      ? inRangeStatus({
          outOfRange: row.isOutOfRange,
          activeBinId: row.poolActiveBinId,
          lowerBinId: p.lowerBinId,
          upperBinId: p.upperBinId,
        })
      : null,
    depositX: row?.allTimeDeposits?.tokenX?.amount ?? null,
    depositY: row?.allTimeDeposits?.tokenY?.amount ?? null,
    liquidityUsd: u?.balances ?? null,
    liquiditySol: u?.balancesSol ?? null,
    feesUsd: row?.allTimeFees?.total?.usd ?? null,
    feesSol: row?.allTimeFees?.total?.sol ?? null,
    unclaimedUsd: sumKnown([u?.unclaimedFeeTokenX?.usd ?? null, u?.unclaimedFeeTokenY?.usd ?? null]),
    unclaimedSol: sumKnown([u?.unclaimedFeeTokenX?.amountSol ?? null, u?.unclaimedFeeTokenY?.amountSol ?? null]),
    pnlUsd: row?.pnlUsd ?? null,
    pnlSol: row?.pnlSol ?? null,
  };
}

const fail = (message: string): TrackedResult => ({ ok: false, message });

/**
 * Drops the pool's scan so the next read scans again. Refused within a minute of the last scan and while the totals
 * job runs: a new scan restarts that job, which costs one Meteora call per wallet in the pool.
 */
function expireScan(pool: string): boolean {
  const hit = scanCache.get(pool);
  if (!hit || Date.now() - hit.at < TRACKED_REFRESH_MS || totalsJobs.get(pool)?.running) return false;
  scanCache.delete(pool);
  return true;
}

async function buildPage(
  pool: string,
  page: number,
  pageSize: number,
  refresh: boolean,
  filter: WalletFilter,
  sort: TrackedSort,
): Promise<TrackedResult> {
  const refreshed = refresh && expireScan(pool);
  let scan: Scan;
  try {
    scan = await scanFor(pool);
  } catch {
    return fail("Positions could not be read from the Solana RPC. Try again shortly.");
  }

  const { groups } = scan;
  // Before the totals job starts, since it reuses cached detail.
  if (refreshed) {
    for (const g of groups.slice((page - 1) * pageSize, page * pageSize)) detailCache.delete(`${pool}:${g.owner}`);
  }
  const job = totalsJobFor(pool, scan);

  // Filters cut the whole pool before paging. They read the totals job's detail, so a wallet it has not reached yet
  // has no PnL and drops out of a PnL filter until it does; its range falls back to the bins and the active bin.
  const filtering = filter.query.trim() !== "" || filter.range.size > 0 || filter.pnl.size > 0;
  let matched = groups;
  if (filtering) {
    const rowsAll = [...job.rows.values()].flat();
    const active = rowsAll.find((r) => r?.poolActiveBinId != null)?.poolActiveBinId ?? null;
    const keep = new Set(
      filterWallets(
        groups.map((g) => {
          const byAddress = new Map((job.rows.get(g.owner) ?? []).map((r) => [r.positionAddress, r]));
          const positions = g.positions.map((p) => {
            const built = buildPosition(p, byAddress.get(p.address));
            return built.inRange == null
              ? { ...built, inRange: inRangeStatus({ outOfRange: null, activeBinId: active, ...p }) }
              : built;
          });
          return { owner: g.owner, positions, pnlSol: sumKnown(positions.map((p) => p.pnlSol)) };
        }),
        filter,
      ).map((w) => w.owner),
    );
    matched = groups.filter((g) => keep.has(g.owner));
  }
  // Like the PnL filter, this reads the totals job's detail: a wallet it has not reached yet sorts last until it does.
  if (sort === "liquidity") {
    matched = sortByLiquidity(matched, (g) =>
      sumKnown((job.rows.get(g.owner) ?? []).map((r) => r.unrealizedPnl?.balances ?? null)),
    );
  }
  const pages = Math.max(1, Math.ceil(matched.length / pageSize));
  const slice = matched.slice((page - 1) * pageSize, page * pageSize);
  const owners = slice.map((g) => g.owner);

  const details = new Map<string, PnlRow>();
  let next = 0;
  const worker = async () => {
    while (next < owners.length) {
      const owner = owners[next++];
      if (owner === undefined) break;
      const rows = await detailFor(pool, owner);
      for (const row of rows ?? []) details.set(row.positionAddress, row);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PNL_CONCURRENCY, owners.length) }, worker));

  const wallets: TrackedWallet[] = slice.map((g) => {
    const positions = g.positions
      .map((p) => buildPosition(p, details.get(p.address)))
      .sort((a, b) => (b.createdAt ?? -Infinity) - (a.createdAt ?? -Infinity));
    return { owner: g.owner, positions, pnlSol: sumKnown(positions.map((p) => p.pnlSol)) };
  });

  // Range status for every position in the pool, not just this page: bins come from the scan and the active bin is
  // one value for the pool, so only this page's Meteora detail is needed. Meteora's own flag wins where it is known.
  const activeBinId = [...details.values()].find((r) => r.poolActiveBinId != null)?.poolActiveBinId ?? null;
  let inRangePositions = 0;
  let rangeKnownPositions = 0;
  for (const g of groups) {
    for (const p of g.positions) {
      const row = details.get(p.address);
      const status = inRangeStatus({
        outOfRange: row?.isOutOfRange,
        activeBinId: row?.poolActiveBinId ?? activeBinId,
        lowerBinId: p.lowerBinId,
        upperBinId: p.upperBinId,
      });
      if (status == null) continue;
      rangeKnownPositions++;
      if (status) inRangePositions++;
    }
  }

  return {
    ok: true,
    pool,
    page,
    pageSize,
    pages,
    totalWallets: groups.length,
    matchedWallets: matched.length,
    totalPositions: groups.reduce((n, g) => n + g.positions.length, 0),
    inRangePositions,
    rangeKnownPositions,
    totals: poolTotals(job),
    scannedAt: scan.at,
    wallets,
    unmatched: slice.reduce((n, g) => n + g.positions.filter((p) => !details.has(p.address)).length, 0),
  };
}

/**
 * One page of the pool's wallets with open positions, newest activity first. The scan is cached per pool for five
 * minutes and each wallet's Meteora detail for one minute, so paging back does not refetch. `refresh` asks for a
 * new scan and new detail for this page; see `expireScan` for when it is honored.
 */
export function trackedPositions(
  pool: string,
  page = 1,
  pageSize: TrackedPageSize = TRACKED_PAGE_SIZES[0],
  refresh = false,
  filter: WalletFilter = { query: "", range: new Set(), pnl: new Set() },
  sort: TrackedSort = "recent",
): Promise<TrackedResult> {
  return buildPage(pool, page, pageSize, refresh, filter, sort);
}
