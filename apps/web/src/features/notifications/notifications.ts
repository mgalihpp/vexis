// Client-safe notification model. There is no notification backend: the browser polls the favorite wallets and
// pools, and `diffWatch` turns the change since the last poll into notices.

import type { Currency } from "@/features/portfolio/portfolio";
import { shortAddr } from "@/lib/format";

export interface WatchPosition {
  address: string;
  pool: string;
  pair: string;
  inRange: boolean | null;
}

export interface VolumeBar {
  t: number;
  volume: number;
}

/** One poll. A null list means that wallet or pool failed this time and keeps its previous state. */
export interface Watch {
  wallets: { wallet: string; positions: WatchPosition[] | null }[];
  pools: { pool: string; bars: VolumeBar[] | null }[];
}

export type NoticeKind = "out-of-range" | "opened" | "closed" | "volume-spike";
export type SpikeMultiplier = 2 | 3 | 5 | 10 | "off";
export interface PoolAlertOverride {
  timeframe: SpikeTimeframe;
  multiplier: SpikeMultiplier;
  minVolume: number;
  minCurrency: Currency;
}

export interface Notice {
  id: string;
  kind: NoticeKind;
  at: number;
  title: string;
  body: string;
  wallet?: string;
  pool?: string;
  read: boolean;
}

/** What the last poll saw: open positions per wallet, and the hour bar each pool last spiked on. */
export interface Seen {
  positions: Record<string, Record<string, { pair: string; inRange: boolean | null }>>;
  spikes: Record<string, number>;
}

export interface NotifyPrefs {
  outOfRange: boolean;
  positions: boolean;
  volumeSpike: boolean;
  spikeMultiplier: SpikeMultiplier;
  spikeTimeframe: SpikeTimeframe;
  /** The smallest candle volume that can count, in USD; null when a SOL minimum has no SOL price to convert at. */
  spikeMinUsd: number | null;
  /** Spike amounts are shown in this currency. */
  currency: Currency;
  solPrice: number | null;
}

export const SPIKE_TIMEFRAMES = ["5m", "30m", "1h", "4h"] as const;
export type SpikeTimeframe = (typeof SPIKE_TIMEFRAMES)[number];

export const EMPTY_SEEN: Seen = { positions: {}, spikes: {} };

// The 24 candles before the current one set the baseline; fewer than this many is too little history to judge.
export const BASELINE_BARS = 24;
const MIN_BASELINE_BARS = 6;

export type Spike =
  | {
      kind: "minimum-volume";
      t: number;
      volume: number;
    }
  | {
      kind: "multiple";
      t: number;
      volume: number;
      average: number;
    };

/** The current candle's USD volume against the average of the candles before it, oldest first. */
export function volumeSpike(bars: VolumeBar[], multiplier: SpikeMultiplier, minUsd: number): Spike | null {
  const current = bars.at(-1);
  if (!current || current.volume < minUsd) return null;
  if (multiplier === "off") return { kind: "minimum-volume", t: current.t, volume: current.volume };

  const baseline = bars.slice(0, -1).slice(-BASELINE_BARS);
  if (baseline.length < MIN_BASELINE_BARS) return null;
  const average = baseline.reduce((sum, b) => sum + b.volume, 0) / baseline.length;
  if (average <= 0 || current.volume < average * multiplier) return null;
  return { kind: "multiple", t: current.t, volume: current.volume, average };
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact" });
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

const volumeIn = (amountUsd: number, currency: Currency, solPrice: number | null) =>
  currency === "sol" && solPrice ? `${compact.format(amountUsd / solPrice)} SOL` : usd.format(amountUsd);

/**
 * The next `Seen` and the notices since `seen`. A wallet seen for the first time only sets the baseline, so adding a
 * favorite does not report every position it already has. Wallets and pools no longer watched are dropped.
 */
export function diffWatch(
  seen: Seen,
  watch: Watch,
  prefs: NotifyPrefs,
  poolNames: Record<string, string>,
  now: number,
  poolOverrides: Record<string, PoolAlertOverride> = {},
): { seen: Seen; notices: Notice[] } {
  const notices: Notice[] = [];
  const add = (n: Omit<Notice, "at" | "read">) => notices.push({ ...n, at: now, read: false });
  const next: Seen = { positions: {}, spikes: {} };

  for (const { wallet, positions } of watch.wallets) {
    const before = seen.positions[wallet];
    if (!positions) {
      if (before) next.positions[wallet] = before;
      continue;
    }
    next.positions[wallet] = Object.fromEntries(
      positions.map((p) => [p.address, { pair: p.pair, inRange: p.inRange }]),
    );
    if (!before) continue;

    const who = `Wallet ${shortAddr(wallet)}`;
    for (const p of positions) {
      if (!(p.address in before)) {
        if (prefs.positions)
          add({ id: `opened:${p.address}`, kind: "opened", title: `Position opened · ${p.pair}`, body: who, wallet });
      } else if (prefs.outOfRange && before[p.address]?.inRange !== false && p.inRange === false) {
        add({
          id: `out-of-range:${p.address}:${now}`,
          kind: "out-of-range",
          title: `Out of range · ${p.pair}`,
          body: who,
          wallet,
        });
      }
    }
    if (prefs.positions) {
      const open = new Set(positions.map((p) => p.address));
      for (const [address, { pair }] of Object.entries(before))
        if (!open.has(address))
          add({
            id: `closed:${address}`,
            kind: "closed",
            title: `Position closed · ${pair}`,
            body: who,
            wallet,
          });
    }
  }

  for (const { pool, bars } of watch.pools) {
    const last = seen.spikes[pool];
    if (last !== undefined) next.spikes[pool] = last;
    if (!bars || !prefs.volumeSpike) continue;
    const override = poolOverrides[pool];
    const multiplier = override?.multiplier ?? prefs.spikeMultiplier;
    const timeframe = override?.timeframe ?? prefs.spikeTimeframe;
    const currency = override?.minCurrency ?? prefs.currency;
    const minUsd = override
      ? currency === "usd"
        ? override.minVolume
        : prefs.solPrice === null
          ? null
          : override.minVolume * prefs.solPrice
      : prefs.spikeMinUsd;
    if (minUsd === null) continue;
    const spike = volumeSpike(bars, multiplier, minUsd);
    if (!spike || spike.t === last) continue;
    next.spikes[pool] = spike.t;
    const amount = volumeIn(spike.volume, currency, prefs.solPrice);
    const detail =
      spike.kind === "minimum-volume"
        ? `${amount} in the current ${timeframe} candle, minimum volume reached`
        : `${amount} in the current ${timeframe} candle, ${(spike.volume / spike.average).toFixed(1)}× the average`;
    add({
      id: `volume-spike:${pool}:${spike.t}`,
      kind: "volume-spike",
      title: `Volume spike · ${poolNames[pool] ?? shortAddr(pool)}`,
      body: detail,
      pool,
    });
  }

  return { seen: next, notices };
}
