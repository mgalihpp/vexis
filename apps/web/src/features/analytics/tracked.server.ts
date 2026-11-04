import { createRequire } from "node:module";
import { Connection, type GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { get } from "../portfolio/meteora.server";
import {
  inRangeStatus,
  sumKnown,
  TRACKED_PAGE_SIZES,
  type TrackedPageSize,
  type TrackedPosition,
  type TrackedResult,
  type TrackedWallet,
} from "./tracked";

// The DLMM program. Every position account is owned by it, and the filters below select one pool's positions.
const DLMM_PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");

// The SDK exports the account filters and the Anchor decoder. Load its CJS build like analytics does.
interface DlmmSdk {
  positionV2Filter: () => GetProgramAccountsFilter;
  positionLbPairFilter: (lbPair: PublicKey) => GetProgramAccountsFilter;
  createProgram: (connection: Connection) => unknown;
  decodeAccount: (program: unknown, accountName: string, buffer: Buffer) => unknown;
}
const sdkModule: unknown = createRequire(import.meta.url)("@meteora-ag/dlmm");
const sdk = ((sdkModule as { default?: unknown }).default ?? sdkModule) as DlmmSdk;

/** The fields of a decoded PositionV2 account this section reads. */
interface DecodedPosition {
  owner: PublicKey;
  lowerBinId: number;
  upperBinId: number;
  lastUpdatedAt: { toString(): string };
}

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC);
const program = sdk.createProgram(connection);

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

/** Every open position in the pool, grouped by owner and ordered by latest activity. */
async function scanOwners(pool: string): Promise<OwnerGroup[]> {
  const accounts = await connection.getProgramAccounts(DLMM_PROGRAM, {
    filters: [sdk.positionV2Filter(), sdk.positionLbPairFilter(new PublicKey(pool))],
  });
  const groups = new Map<string, OwnerGroup>();
  for (const { pubkey, account } of accounts) {
    const decoded = sdk.decodeAccount(program, "positionV2", account.data) as DecodedPosition;
    const owner = decoded.owner.toBase58();
    const updated = Number(decoded.lastUpdatedAt.toString());
    const position: OnChainPosition = {
      address: pubkey.toBase58(),
      owner,
      lowerBinId: decoded.lowerBinId,
      upperBinId: decoded.upperBinId,
    };
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
async function fetchOwnerDetail(pool: string, owner: string): Promise<PnlRow[] | null> {
  try {
    const out: PnlRow[] = [];
    for (let page = 1; page <= PNL_MAX_PAGES; page++) {
      const r = await get(`/positions/${pool}/pnl`, PnlPage, { user: owner, status: "open", page, page_size: 100 });
      out.push(...r.positions);
      if (!r.hasNext) break;
    }
    return out;
  } catch {
    return null;
  }
}

const scanCache = new Map<string, { at: number; value: Promise<Scan> }>();
const detailCache = new Map<string, { at: number; value: Promise<PnlRow[] | null> }>();

function cached<T>(
  map: Map<string, { at: number; value: Promise<T> }>,
  key: string,
  ttl: number,
  load: () => Promise<T>,
) {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = load();
  const entry = { at: Date.now(), value };
  map.set(key, entry);
  // A failed load is not kept, so the next request retries it.
  value.catch(() => {
    if (map.get(key) === entry) map.delete(key);
  });
  return value;
}

const scanFor = (pool: string) =>
  cached(scanCache, pool, SCAN_CACHE_MS, async () => ({ at: Date.now(), groups: await scanOwners(pool) }));

const detailFor = (pool: string, owner: string) =>
  cached(detailCache, `${pool}:${owner}`, DETAIL_CACHE_MS, () => fetchOwnerDetail(pool, owner));

const ms = (t: number) => (t < 1e12 ? t * 1000 : t);

function buildPosition(p: OnChainPosition, row: PnlRow | undefined): TrackedPosition {
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
    feesUsd: row?.allTimeFees?.total?.usd ?? null,
    pnlUsd: row?.pnlUsd ?? null,
    pnlSol: row?.pnlSol ?? null,
  };
}

const fail = (message: string): TrackedResult => ({ ok: false, message });

async function buildPage(pool: string, page: number, pageSize: number): Promise<TrackedResult> {
  let scan: Scan;
  try {
    scan = await scanFor(pool);
  } catch {
    return fail("Positions could not be read from the Solana RPC. Try again shortly.");
  }

  const { groups } = scan;
  const pages = Math.max(1, Math.ceil(groups.length / pageSize));
  const slice = groups.slice((page - 1) * pageSize, page * pageSize);

  const details = new Map<string, PnlRow>();
  const owners = slice.map((g) => g.owner);
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
    return { owner: g.owner, positions, pnlUsd: sumKnown(positions.map((p) => p.pnlUsd)) };
  });

  return {
    ok: true,
    pool,
    page,
    pageSize,
    pages,
    totalWallets: groups.length,
    totalPositions: groups.reduce((n, g) => n + g.positions.length, 0),
    scannedAt: scan.at,
    wallets,
    unmatched: slice.reduce((n, g) => n + g.positions.filter((p) => !details.has(p.address)).length, 0),
  };
}

/**
 * One page of the pool's wallets with open positions, newest activity first. The scan is cached per pool for five
 * minutes and each wallet's Meteora detail for one minute, so paging back does not refetch.
 */
export function trackedPositions(
  pool: string,
  page = 1,
  pageSize: TrackedPageSize = TRACKED_PAGE_SIZES[0],
): Promise<TrackedResult> {
  return buildPage(pool, page, pageSize);
}
