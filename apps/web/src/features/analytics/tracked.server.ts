import { createRequire } from "node:module";
import { Connection, type GetProgramAccountsFilter, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { get } from "../portfolio/meteora.server";
import { groupByOwner, inRangeStatus, type TrackedPosition, type TrackedResult } from "./tracked";

// The DLMM program. Every position account is owned by it, and the filters below select one pool's positions.
const DLMM_PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
// PositionV2 layout: 8-byte discriminator, then lb_pair (offset 8) and owner (offset 40), both 32-byte keys.
const OWNER_OFFSET = 40;

// The SDK's named exports hold the discriminator and lb_pair filters. Load its CJS build like analytics does.
type DlmmFilters = {
  positionV2Filter: () => GetProgramAccountsFilter;
  positionLbPairFilter: (lbPair: PublicKey) => GetProgramAccountsFilter;
};
const sdk: unknown = createRequire(import.meta.url)("@meteora-ag/dlmm");
const filters = ((sdk as { default?: unknown }).default ?? sdk) as DlmmFilters;

const RPC = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC);

const SCAN_CACHE_MS = 5 * 60_000;
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
  lowerBinId: z.number().nullish(),
  upperBinId: z.number().nullish(),
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

interface Scanned {
  address: string;
  owner: string;
}

/** Every open position in the pool, with its owner. Reads only the owner bytes of each account. */
async function scanOwners(pool: string): Promise<Scanned[]> {
  const accounts = await connection.getProgramAccounts(DLMM_PROGRAM, {
    filters: [filters.positionV2Filter(), filters.positionLbPairFilter(new PublicKey(pool))],
    dataSlice: { offset: OWNER_OFFSET, length: 32 },
  });
  return accounts.map((a) => ({
    address: a.pubkey.toBase58(),
    owner: new PublicKey(a.account.data).toBase58(),
  }));
}

/** Meteora's open-position detail for one owner in one pool, every page. Null when the request fails. */
async function ownerDetail(pool: string, owner: string): Promise<PnlRow[] | null> {
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

const ms = (t: number) => (t < 1e12 ? t * 1000 : t);

async function build(pool: string): Promise<TrackedResult> {
  let scanned: Scanned[];
  try {
    scanned = await scanOwners(pool);
  } catch {
    return { ok: false, message: "Positions could not be read from the Solana RPC. Try again shortly." };
  }

  const owners = [...new Set(scanned.map((s) => s.owner))];
  const details = new Map<string, PnlRow>();
  let next = 0;
  const worker = async () => {
    while (next < owners.length) {
      const owner = owners[next++];
      if (owner === undefined) break;
      const rows = await ownerDetail(pool, owner);
      for (const row of rows ?? []) details.set(row.positionAddress, row);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PNL_CONCURRENCY, owners.length) }, worker));

  const positions: TrackedPosition[] = scanned.map(({ address, owner }): TrackedPosition => {
    const row = details.get(address);
    const lowerBinId = row?.lowerBinId ?? null;
    const upperBinId = row?.upperBinId ?? null;
    return {
      address,
      owner,
      createdAt: row?.createdAt == null ? null : ms(row.createdAt),
      lowerBinId,
      upperBinId,
      activeBinId: row?.poolActiveBinId ?? null,
      minPrice: row?.minPrice ?? null,
      maxPrice: row?.maxPrice ?? null,
      inRange: row
        ? inRangeStatus({
            outOfRange: row.isOutOfRange,
            activeBinId: row.poolActiveBinId,
            lowerBinId,
            upperBinId,
          })
        : null,
      depositX: row?.allTimeDeposits?.tokenX?.amount ?? null,
      depositY: row?.allTimeDeposits?.tokenY?.amount ?? null,
      feesUsd: row?.allTimeFees?.total?.usd ?? null,
      pnlUsd: row?.pnlUsd ?? null,
      pnlSol: row?.pnlSol ?? null,
    };
  });

  return {
    ok: true,
    pool,
    scannedAt: Date.now(),
    wallets: groupByOwner(positions),
    unmatched: positions.filter((p) => !details.has(p.address)).length,
  };
}

const scanCache = new Map<string, { at: number; value: Promise<TrackedResult> }>();

/**
 * Open positions of one pool, grouped by owner. Cached per pool for five minutes. A failed scan is not kept, so the next
 * request retries it. A failed owner keeps its positions with the detail missing.
 */
export function trackedPositions(pool: string): Promise<TrackedResult> {
  const hit = scanCache.get(pool);
  if (hit && Date.now() - hit.at < SCAN_CACHE_MS) return hit.value;
  const value = build(pool);
  const entry = { at: Date.now(), value };
  scanCache.set(pool, entry);
  value.then((r) => {
    if (!r.ok && scanCache.get(pool) === entry) scanCache.delete(pool);
  });
  return value;
}
