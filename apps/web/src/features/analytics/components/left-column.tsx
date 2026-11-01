import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  ExternalLinkIcon,
  StarIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TokenIcon } from "@/features/portfolio/components/pool-identity";
import { compactUsd, formatAmount, formatPrice, pct } from "@/features/portfolio/money";
import { shortAddr } from "@/lib/format";
import { usePools } from "@/stores/pools";
import { age, binDistribution, perMinute, ratio } from "../analytics";
import type { ChainView, PoolTokenView, PoolView, SiblingPool } from "../analytics.types";
import { PoolCard, tinyUsd } from "./center-column";
import { PoolHitList, SearchInput, usePoolHits } from "./pool-search";
import { compact, Label, NA, Panel, Row } from "./ui";

function CopyAddress({ address }: { address: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(address).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="num flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
    >
      {shortAddr(address)}
      {done ? <CheckIcon className="size-2.5" /> : <CopyIcon className="size-2.5" />}
    </button>
  );
}

export function PairIcons({ pool }: { pool: PoolView }) {
  return (
    <div className="flex shrink-0">
      <TokenIcon token={pool.tokenX} className="relative z-10 size-6.5 text-xs ring-2 ring-card" />
      <TokenIcon token={pool.tokenY} className="-ml-2 size-6.5 text-xs" />
    </div>
  );
}

const feeLine = (pool: PoolView) => `Fee: ${pct(pool.baseFeePct / 100)} | Bin Step: ${pool.binStep}`;

/** Phone variant of the pool picker: a bottom sheet with this pair's bin steps and a search for other pairs. */
function PoolSheet({ pool, siblings }: { pool: PoolView; siblings: SiblingPool[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hits = usePoolHits(query, open);
  const close = () => setOpen(false);
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DrawerTrigger asChild>
        <button type="button" className="flex w-full items-center gap-2 text-left xl:hidden">
          <PairIcons pool={pool} />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold">{pool.name}</div>
            <div className="text-[11px] text-muted-foreground">{feeLine(pool)}</div>
          </div>
          <ChevronDownIcon className="size-5 text-muted-foreground" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <div className="flex items-center gap-2 border-b px-4 pt-2 pb-3">
          <PairIcons pool={pool} />
          <DrawerTitle className="text-base">{pool.name}</DrawerTitle>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {siblings.length} Pools
          </span>
          <a
            href={`https://app.meteora.ag/dlmm/${pool.address}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Open on Meteora"
            className="ml-auto text-muted-foreground"
          >
            <ExternalLinkIcon className="size-4" />
          </a>
          <DrawerClose aria-label="Close" className="text-muted-foreground">
            <XIcon className="size-5" />
          </DrawerClose>
        </div>
        <div className="flex flex-col gap-2 overflow-y-auto p-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search another pair or mint" />
          {query.trim() ? (
            <PoolHitList query={query} hits={hits} onSelect={close} />
          ) : (
            siblings.map((s) => <PoolCard key={s.address} pool={pool} s={s} onSelect={close} />)
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/** Desktop variant of the pool picker: a dialog listing this pair's bin steps, plus a search for other pairs. */
function PoolDialog({ pool, siblings }: { pool: PoolView; siblings: SiblingPool[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hits = usePoolHits(query, open);
  const close = () => setOpen(false);
  const cols = "grid grid-cols-[2.4fr_1fr_1fr_1fr_1fr_20px] items-center gap-2 px-4";
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="hidden w-full items-center gap-2 text-left xl:flex">
          <PairIcons pool={pool} />
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold">{pool.name}</div>
            <div className="text-[11px] text-muted-foreground">{feeLine(pool)}</div>
          </div>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="gap-0 p-0 sm:max-w-4xl">
        <div className="flex items-center gap-2 border-b px-4 py-3 pr-12">
          <PairIcons pool={pool} />
          <DialogTitle className="text-base">{pool.name}</DialogTitle>
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {siblings.length} Pools
          </span>
          <a
            href={`https://app.meteora.ag/dlmm/${pool.address}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Open on Meteora"
            className="text-muted-foreground hover:text-brand"
          >
            <ExternalLinkIcon className="size-3.5" />
          </a>
          <div className="ml-auto w-64">
            <SearchInput value={query} onChange={setQuery} placeholder="Search another pair or mint" />
          </div>
        </div>
        {query.trim() ? (
          <div className="p-3">
            <PoolHitList query={query} hits={hits} onSelect={close} />
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto pb-1">
            <div className={`${cols} py-2.5 text-xs text-muted-foreground`}>
              <span>Pool</span>
              <span>TVL</span>
              <span>24h Vol</span>
              <span>24h Fee</span>
              <span>24h Fee/TVL</span>
              <span />
            </div>
            {siblings.map((s) => {
              const active = s.address === pool.address;
              return (
                <Link
                  key={s.address}
                  to="/analytics"
                  search={(prev) => ({ ...prev, pool: s.address })}
                  onClick={close}
                  className={`${cols} num h-11 border-t text-sm font-medium hover:bg-muted/60 ${active ? "bg-muted/40" : ""}`}
                >
                  <span className="flex items-center gap-3 whitespace-nowrap text-xs font-normal text-muted-foreground">
                    <span>
                      Bin Step: <b className="text-sm font-semibold text-foreground">{s.binStep}</b>
                    </span>
                    <span>
                      Fee: <b className="text-sm font-semibold text-foreground">{Number(s.baseFeePct.toFixed(2))}%</b>
                    </span>
                    {active && (
                      <span className="rounded-md bg-brand/20 px-1.5 py-0.5 text-[11px] font-medium text-brand">
                        Current
                      </span>
                    )}
                  </span>
                  <span>{tinyUsd(s.tvl)}</span>
                  <span>{tinyUsd(s.volume24h)}</span>
                  <span>{tinyUsd(s.fees24h)}</span>
                  <span>{pct(ratio(s.fees24h, s.tvl))}</span>
                  {active ? <span /> : <ChevronRightIcon className="size-4 text-muted-foreground" />}
                </Link>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FavoriteStar({ pool }: { pool: PoolView }) {
  const isFavorite = usePools((s) => s.favorites.some((p) => p.address === pool.address));
  const toggle = usePools((s) => s.toggleFavorite);
  return (
    <button
      type="button"
      aria-label={isFavorite ? "Remove pool from favorites" : "Add pool to favorites"}
      aria-pressed={isFavorite}
      onClick={() => toggle({ address: pool.address, name: pool.name, binStep: pool.binStep })}
      className="absolute top-1/2 right-9 -translate-y-1/2 text-muted-foreground hover:text-foreground"
    >
      <StarIcon className={`size-4 ${isFavorite ? "fill-brand text-brand" : ""}`} />
    </button>
  );
}

export function PoolHeader({
  pool,
  siblings,
  price,
  priceUnit,
}: {
  pool: PoolView;
  siblings: SiblingPool[];
  price: string;
  priceUnit: string;
}) {
  return (
    <Panel className="gap-3">
      <div className="relative">
        <PoolSheet pool={pool} siblings={siblings} />
        <PoolDialog pool={pool} siblings={siblings} />
        <FavoriteStar pool={pool} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Current Pool Price</Label>
          <div className="num text-sm font-semibold">
            {price} <span className="text-[11px] font-normal text-muted-foreground">{priceUnit}</span>
          </div>
        </div>
        <div>
          <Label>Total Value Locked</Label>
          <div className="num text-sm font-semibold">{compactUsd(pool.tvl)}</div>
        </div>
      </div>
    </Panel>
  );
}

function TokenRow({ token, share, color }: { token: PoolTokenView; share: number; color: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <TokenIcon token={token} className="size-4.5 text-[10px]" />
        <span className="text-[13px] font-semibold">{token.symbol}</span>
        <CopyAddress address={token.address} />
        <span className="num ml-auto text-[13px] font-semibold">{formatAmount(token.amount)}</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: color }} />
      </div>
    </div>
  );
}

export function PoolTokens({ pool }: { pool: PoolView }) {
  const total = pool.tokenX.usd + pool.tokenY.usd;
  return (
    <Panel className="gap-3">
      <TokenRow token={pool.tokenX} share={ratio(pool.tokenX.usd, total)} color="var(--brand)" />
      <TokenRow token={pool.tokenY} share={ratio(pool.tokenY.usd, total)} color="var(--sol)" />
    </Panel>
  );
}

/** Horizontal share (0 to 1) of the bar row where `price` falls; bars are equal width, so it is placed inside its bucket. */
function pricePosition(buckets: { from: number; to: number }[], price: number) {
  const n = buckets.length;
  if (n === 0) return null;
  const i = buckets.findIndex((b) => price >= b.from && price <= b.to);
  if (i >= 0) {
    const b = buckets[i] as { from: number; to: number };
    return (i + (b.to > b.from ? (price - b.from) / (b.to - b.from) : 0.5)) / n;
  }
  const gap = buckets.findIndex((b) => price < b.from);
  if (gap > 0) return gap / n;
  return null;
}

export function LiquidityDistribution({ pool, chain }: { pool: PoolView; chain: ChainView | null }) {
  const [reach, setReach] = useState(20);
  const { tokenX: x, tokenY: y } = pool;
  const buckets = chain ? binDistribution(chain.bins, chain.activeBinId, reach, x.price, y.price) : [];
  const peak = Math.max(...buckets.map((b) => b.xUsd + b.yUsd), 1e-12);
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  const labels = first && last ? [0, 1, 2, 3].map((i) => first.from + ((last.to - first.from) * i) / 3) : [];
  const zoom = "text-muted-foreground hover:text-foreground disabled:opacity-30";
  const at = pricePosition(buckets, pool.price);
  return (
    <Panel
      title="Liquidity Distribution"
      aside={
        <div className="flex gap-2.5">
          <button
            type="button"
            aria-label="Zoom in"
            disabled={reach <= 5}
            onClick={() => setReach((r) => Math.max(5, Math.round(r / 2)))}
            className={zoom}
          >
            <ZoomInIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            disabled={reach >= 60}
            onClick={() => setReach((r) => Math.min(60, r * 2))}
            className={zoom}
          >
            <ZoomOutIcon className="size-4" />
          </button>
        </div>
      }
    >
      <div className="flex gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-full bg-brand" />
          {x.symbol}
        </span>
        <span className="flex items-center gap-1.5">
          <i className="size-2 rounded-full" style={{ background: "var(--sol)" }} />
          {y.symbol}
        </span>
      </div>
      {buckets.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">Could not read the pool's bins.</p>
      ) : (
        <>
          <div className="relative mt-9 flex h-28 items-end gap-1">
            {at !== null && (
              <div
                className="pointer-events-none absolute -top-9 bottom-0 z-10 border-l-2 border-foreground"
                style={{ left: `${at * 100}%` }}
              >
                <div
                  className={`absolute top-0 flex flex-col items-center rounded-md bg-popover px-2.5 py-1 text-[11px] whitespace-nowrap shadow-md ring-1 ring-border ${
                    at < 0.25 ? "left-0 items-start" : at > 0.75 ? "right-0 items-end" : "-translate-x-1/2"
                  }`}
                >
                  <span className="text-muted-foreground">Pool Price</span>
                  <span className="num font-semibold">
                    {formatPrice(pool.price)} {y.symbol}/{x.symbol}
                  </span>
                </div>
              </div>
            )}
            {buckets.map((b) => {
              const total = b.xUsd + b.yUsd;
              return (
                <Tooltip key={b.from}>
                  <TooltipTrigger asChild>
                    <div className="flex h-full flex-1 flex-col justify-end">
                      <div
                        className="flex flex-col overflow-hidden rounded-t-sm"
                        style={{ height: `${Math.max(1, (total / peak) * 100)}%` }}
                      >
                        <div className="bg-brand" style={{ flex: b.xUsd }} />
                        <div style={{ flex: b.yUsd, background: "var(--sol)" }} />
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="w-48 flex-col items-stretch gap-0 p-2.5 text-[11px]">
                    <div className="num text-muted-foreground">
                      {formatPrice(b.from)} – {formatPrice(b.to)}
                    </div>
                    <div className="num mt-0.5 text-sm font-semibold">{compactUsd(total)}</div>
                    <div className="mt-2 flex flex-col gap-1 border-t pt-2">
                      {(
                        [
                          [x.symbol, b.xUsd, "var(--brand)"],
                          [y.symbol, b.yUsd, "var(--sol)"],
                        ] as const
                      ).map(([symbol, usd, color]) => (
                        <div key={symbol} className="num flex items-center gap-1.5">
                          <i className="size-1.5 rounded-full" style={{ background: color }} />
                          <span className="text-muted-foreground">{symbol}</span>
                          <span className="ml-auto font-semibold">{compactUsd(usd)}</span>
                          <span className="w-9 text-right text-muted-foreground">{pct(ratio(usd, total), 0)}</span>
                        </div>
                      ))}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
          <div className="num flex justify-between text-[10px] text-muted-foreground">
            {labels.map((l) => (
              <span key={l}>{formatPrice(l)}</span>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

const signedUsd = (v: number) => `${v < 0 ? "-" : "+"}${compactUsd(Math.abs(v))}`;

export function AdvancedMetrics({ pool, now }: { pool: PoolView; now: number }) {
  const s = pool.stats;
  const n = (v: number | undefined, f: (v: number) => string) => (v === undefined ? NA : f(v));
  return (
    <Panel title="Advanced Metrics" className="gap-2">
      <Row label="Pool Age" value={age(pool.createdAt, now)} />
      <Row label="Volatility" value={n(s?.volatility, (v) => v.toFixed(2))} />
      <Row label="Active TVL" value={n(s?.activeTvl, compactUsd)} />
      <Row label="Fees / Active TVL" value={n(s?.feeActiveTvl, (v) => pct(v))} />
      <Row label="Volume / Active TVL" value={n(s?.volumeActiveTvl, (v) => `${v.toFixed(2)}x`)} />
      <Row label="Total LPs" value={n(s?.totalLps, compact)} />
      <Row label="Unique LPs" value={n(s?.uniqueLps, compact)} />
      <Row label="Positions Created" value={n(s?.positionsCreated, compact)} />
      <Row label="Open Positions" value={n(s?.openPositions, compact)} />
      <Row label="In Range Positions" value={n(s?.inRangePositions, compact)} />
      <Row label="Avg Fees/Min" value={compactUsd(perMinute(pool.fees24h))} />
      <Row label="Avg Vol/Min" value={compactUsd(perMinute(pool.volume24h))} />
      <Row label="Traders" value={n(s?.traders, compact)} />
      <Row label="Swaps" value={n(s?.swaps, compact)} />
      <Row
        label="Net Deposits"
        value={n(s?.netDeposits, signedUsd)}
        className={s ? (s.netDeposits >= 0 ? "text-profit" : "text-loss") : ""}
      />
    </Panel>
  );
}
