// Client-safe types and pure math for the tracked-wallets section.

export interface TrackedPosition {
  address: string;
  owner: string;
  /** Epoch ms, null when Meteora did not return the position's detail. */
  createdAt: number | null;
  lowerBinId: number | null;
  upperBinId: number | null;
  /** The pool's active bin when Meteora read the position. */
  activeBinId: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  inRange: boolean | null;
  /** All-time deposits in token units. */
  depositX: number | null;
  depositY: number | null;
  /** Current value of the position's tokens, unclaimed fees excluded. */
  liquidityUsd: number | null;
  liquiditySol: number | null;
  feesUsd: number | null;
  feesSol: number | null;
  unclaimedUsd: number | null;
  unclaimedSol: number | null;
  pnlUsd: number | null;
  pnlSol: number | null;
}

export interface TrackedWallet {
  owner: string;
  positions: TrackedPosition[];
  /** Sum of the wallet's position PnL in SOL, null when none of them has a value. */
  pnlSol: number | null;
}

/** Fees and PnL summed over the wallets whose Meteora detail has loaded so far. */
export interface PoolTotals {
  feesUsd: number | null;
  feesSol: number | null;
  pnlUsd: number | null;
  pnlSol: number | null;
  /** Wallets fetched so far, failed ones included. */
  loaded: number;
  total: number;
  /** Wallets whose detail request failed; their figures are missing from the sums. */
  failed: number;
  running: boolean;
}

/** Rows per page the user can pick; the first is the default. */
export const TRACKED_PAGE_SIZES = [10, 25, 50] as const;
export type TrackedPageSize = (typeof TRACKED_PAGE_SIZES)[number];

/** How old a pool's scan must be before a refresh scans again. */
export const TRACKED_REFRESH_MS = 60_000;

export type TrackedResult =
  | {
      ok: true;
      pool: string;
      /** 1-based page of wallets, newest activity first. */
      page: number;
      pageSize: number;
      pages: number;
      /** Wallets with an open position in the pool, across every page. */
      totalWallets: number;
      /** Wallets that pass the request's filters, across every page; the page count follows this. */
      matchedWallets: number;
      totalPositions: number;
      /** In-range positions across every page, judged against the pool's active bin. */
      inRangePositions: number;
      /** Positions across every page whose range status is known. */
      rangeKnownPositions: number;
      /** Fees and PnL across every page, filled in by a background job. */
      totals: PoolTotals;
      scannedAt: number;
      /** This page's wallets only. */
      wallets: TrackedWallet[];
      /** Open on-chain positions on this page that Meteora returned no detail for. */
      unmatched: number;
    }
  | { ok: false; message: string };

/**
 * Whether the pool's active bin sits inside the position's range. Meteora's own out-of-range flag wins; the bin
 * comparison covers rows that lack it. Null when neither is known.
 */
export function inRangeStatus(input: {
  outOfRange: boolean | null | undefined;
  activeBinId: number | null | undefined;
  lowerBinId: number | null;
  upperBinId: number | null;
}): boolean | null {
  if (typeof input.outOfRange === "boolean") return !input.outOfRange;
  const { activeBinId, lowerBinId, upperBinId } = input;
  if (activeBinId == null || lowerBinId == null || upperBinId == null) return null;
  return lowerBinId <= activeBinId && activeBinId <= upperBinId;
}

/** Sum of the known values, or null when every value is unknown. */
export function sumKnown(values: ReadonlyArray<number | null>): number | null {
  let total: number | null = null;
  for (const v of values) {
    if (v == null) continue;
    total = (total ?? 0) + v;
  }
  return total;
}

export type RangeFilter = "in" | "out";
export type PnlFilter = "profit" | "loss";

export interface WalletFilter {
  /** Part of a wallet or position address, any case. */
  query: string;
  /** Empty means any. Otherwise the wallet needs a position in one of the picked states. */
  range: ReadonlySet<RangeFilter>;
  /** Empty means any. Otherwise the wallet's SOL PnL must have one of the picked signs. */
  pnl: ReadonlySet<PnlFilter>;
}

/** Newest activity first, or the wallets holding the most liquidity first. */
export type TrackedSort = "recent" | "liquidity";

/** Largest value first; unknown values go last, and ties keep their incoming order. */
export function sortByLiquidity<T>(items: readonly T[], liquidity: (item: T) => number | null): T[] {
  const key = (item: T) => liquidity(item) ?? -Infinity;
  return [...items].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    return x === y ? 0 : y > x ? 1 : -1;
  });
}

export function filterWallets(wallets: readonly TrackedWallet[], filter: WalletFilter): TrackedWallet[] {
  const q = filter.query.trim().toLowerCase();
  return wallets.filter((w) => {
    if (q && !w.owner.toLowerCase().includes(q) && !w.positions.some((p) => p.address.toLowerCase().includes(q))) {
      return false;
    }
    if (filter.range.size > 0) {
      const has = (state: RangeFilter) => w.positions.some((p) => p.inRange === (state === "in"));
      if (![...filter.range].some(has)) return false;
    }
    if (filter.pnl.size > 0) {
      if (w.pnlSol == null || w.pnlSol === 0) return false;
      if (!filter.pnl.has(w.pnlSol > 0 ? "profit" : "loss")) return false;
    }
    return true;
  });
}

/** Groups positions by owner. Wallets with most positions come first; each wallet lists its newest position first. */
export function groupByOwner(positions: readonly TrackedPosition[]): TrackedWallet[] {
  const byOwner = new Map<string, TrackedPosition[]>();
  for (const p of positions) {
    const list = byOwner.get(p.owner);
    if (list) list.push(p);
    else byOwner.set(p.owner, [p]);
  }
  const wallets: TrackedWallet[] = [...byOwner].map(([owner, list]) => ({
    owner,
    positions: [...list].sort((a, b) => (b.createdAt ?? -Infinity) - (a.createdAt ?? -Infinity)),
    pnlSol: sumKnown(list.map((p) => p.pnlSol)),
  }));
  return wallets.sort((a, b) => b.positions.length - a.positions.length || a.owner.localeCompare(b.owner));
}

/** One bin of a position: its price and the token amounts it holds, in token units. */
export interface PositionBin {
  id: number;
  price: number;
  x: number;
  y: number;
}

export type PositionBinsResult =
  | { ok: true; activeBinId: number; bins: PositionBin[] }
  | { ok: false; message: string };

export interface PositionBar {
  /** First and last bin of the bar, equal unless neighbouring bins were merged. */
  id: number;
  lastId: number;
  price: number;
  lastPrice: number;
  /** Token units in all the bar's bins. */
  x: number;
  y: number;
  /** Bins in the bar, so a merged bar can be drawn per bin and stand as tall as a lone bin does. */
  count: number;
  side: "below" | "active" | "above";
}

/**
 * The position's bins in price order, merged into at most `maxBars` bars. Merging is cut outward from the active bin,
 * which stays a bar of its own, so a bar never mixes token Y (below) with token X (above).
 */
export function positionBars(bins: readonly PositionBin[], activeId: number, maxBars: number): PositionBar[] {
  const sorted = [...bins].sort((a, b) => a.id - b.id);
  const size = Math.max(1, Math.ceil(sorted.length / maxBars));
  const bars = new Map<string, PositionBar>();
  for (const b of sorted) {
    const side = b.id < activeId ? "below" : b.id > activeId ? "above" : "active";
    const key = side === "active" ? "active" : `${side}:${Math.ceil(Math.abs(b.id - activeId) / size)}`;
    const bar = bars.get(key);
    if (bar) {
      bar.lastId = b.id;
      bar.lastPrice = b.price;
      bar.x += b.x;
      bar.y += b.y;
      bar.count++;
    } else {
      bars.set(key, { id: b.id, lastId: b.id, price: b.price, lastPrice: b.price, x: b.x, y: b.y, count: 1, side });
    }
  }
  return [...bars.values()].sort((a, b) => a.id - b.id);
}
