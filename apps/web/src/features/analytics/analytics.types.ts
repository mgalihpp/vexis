import type { BinView, FeeMode, StatWindow } from "./analytics";

export interface PoolTokenView {
  address: string;
  symbol: string;
  name: string;
  icon: string | null;
  /** USD. */
  price: number;
  amount: number;
  usd: number;
  marketCap: number;
  fdv: number | null;
  holders: number;
  totalSupply: number;
  freezeAuthorityDisabled: boolean;
  mintAuthority: string | null;
  createdAt: number | null;
  topHoldersPct: number | null;
  devMints: number | null;
  /** Percent price change per window, from Jupiter. Token-wide, not pool-level. */
  changes: Record<"5m" | "1h" | "6h" | "24h", number | null>;
  /** Jupiter buy/sell volume per window it reports. Token-wide across every market, not pool-level. */
  flow: Partial<Record<"1h" | "24h", { buy: number; sell: number }>>;
  traders24h: number | null;
  swaps24h: number | null;
}

/** From Meteora's pool-discovery API, 24h window. */
export interface PoolStats {
  activeTvl: number;
  /** 24h fees over active TVL, as a ratio. */
  feeActiveTvl: number;
  volumeActiveTvl: number;
  uniqueLps: number;
  totalLps: number;
  positionsCreated: number;
  openPositions: number;
  inRangePositions: number;
  swaps: number;
  traders: number;
  netDeposits: number;
  volatility: number;
}

/** Read from the pool account over RPC. */
export interface ChainView {
  activeBinId: number;
  bins: BinView[];
  maxFeePct: number;
  /** Base plus variable fee right now. */
  totalFeePct: number;
}

export interface PoolView {
  address: string;
  name: string;
  binStep: number;
  baseFeePct: number;
  maxFeePct: number;
  protocolCutPct: number;
  dynamicFeePct: number;
  feeMode: FeeMode;
  createdAt: number;
  /** Token X priced in token Y. */
  price: number;
  tvl: number;
  volume24h: number;
  fees24h: number;
  /** Pool-level volume and fees per window. */
  windows: Record<StatWindow, { volume: number; fees: number }>;
  cumulativeVolume: number;
  cumulativeFees: number;
  stats: PoolStats | null;
  tokenX: PoolTokenView;
  tokenY: PoolTokenView;
}

export interface SiblingPool {
  address: string;
  binStep: number;
  baseFeePct: number;
  tvl: number;
  volume24h: number;
  fees24h: number;
}

export interface PoolSearchHit {
  address: string;
  name: string;
  binStep: number;
  tvl: number;
  volume24h: number;
}
