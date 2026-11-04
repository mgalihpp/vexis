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
  feesUsd: number | null;
  pnlUsd: number | null;
  pnlSol: number | null;
}

export interface TrackedWallet {
  owner: string;
  positions: TrackedPosition[];
  /** Sum of the wallet's position PnL in USD, null when none of them has a value. */
  pnlUsd: number | null;
}

export type TrackedResult =
  | {
      ok: true;
      pool: string;
      scannedAt: number;
      wallets: TrackedWallet[];
      /** Open on-chain positions Meteora returned no detail for. */
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

export interface RangeBar {
  /** Where the position's range starts and ends on the bar, 0 to 1. */
  start: number;
  end: number;
  /** Where the active bin sits on the bar, 0 to 1. */
  active: number;
  /** Bins between the active bin and the nearest edge of the range; 0 when inside it. */
  outside: number;
  side: "below" | "inside" | "above";
}

/**
 * Lays a position's bin range and the pool's active bin on one bar. The bar spans both, padded by a quarter of that
 * span (at least two bins) on each side, so a range far from the price still shows where the price is.
 */
export function rangeBar(lower: number, upper: number, active: number): RangeBar {
  const lo = Math.min(lower, active);
  const hi = Math.max(upper, active);
  const pad = Math.max(2, (hi - lo + 1) / 4);
  const from = lo - pad;
  const width = hi + 1 + pad - from;
  const at = (bin: number) => (bin - from) / width;
  const side = active < lower ? "below" : active > upper ? "above" : "inside";
  return {
    start: at(lower),
    end: at(upper + 1),
    active: at(active + 0.5),
    outside: side === "below" ? lower - active : side === "above" ? active - upper : 0,
    side,
  };
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
  /** Empty means any. Otherwise the wallet's USD PnL must have one of the picked signs. */
  pnl: ReadonlySet<PnlFilter>;
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
      if (w.pnlUsd == null || w.pnlUsd === 0) return false;
      if (!filter.pnl.has(w.pnlUsd > 0 ? "profit" : "loss")) return false;
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
    pnlUsd: sumKnown(list.map((p) => p.pnlUsd)),
  }));
  return wallets.sort((a, b) => b.positions.length - a.positions.length || a.owner.localeCompare(b.owner));
}
