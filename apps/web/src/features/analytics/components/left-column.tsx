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
import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { PoolAlertSettings } from "@/features/notifications/components/pool-alert-settings";
import { TokenIcon } from "@/features/portfolio/components/pool-identity";
import { compactUsd, formatAmount, formatPrice, pct } from "@/features/portfolio/money";
import { shortAddr } from "@/lib/format";
import { usePools } from "@/stores/pools";
import { age, binDistribution, perMinute, ratio } from "../analytics";
import type { ChainView, PoolTokenView, PoolView, SiblingPool } from "../analytics.types";
import { BinChart, MAX_BARS } from "./bin-chart";
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
                  preload={false}
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
  const updateFavoriteMetadata = usePools((s) => s.updateFavoriteMetadata);
  useEffect(() => {
    if (isFavorite)
      updateFavoriteMetadata({
        address: pool.address,
        name: pool.name,
        binStep: pool.binStep,
        tokenXSymbol: pool.tokenX.symbol,
        tokenXIcon: pool.tokenX.icon,
        tokenYSymbol: pool.tokenY.symbol,
        tokenYIcon: pool.tokenY.icon,
      });
  }, [isFavorite, pool, updateFavoriteMetadata]);
  return (
    <button
      type="button"
      aria-label={isFavorite ? "Remove pool from favorites" : "Add pool to favorites"}
      aria-pressed={isFavorite}
      onClick={() =>
        toggle({
          address: pool.address,
          name: pool.name,
          binStep: pool.binStep,
          tokenXSymbol: pool.tokenX.symbol,
          tokenXIcon: pool.tokenX.icon,
          tokenYSymbol: pool.tokenY.symbol,
          tokenYIcon: pool.tokenY.icon,
        })
      }
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
  usd,
}: {
  pool: PoolView;
  siblings: SiblingPool[];
  price: number;
  priceUnit: string;
  usd: boolean;
}) {
  return (
    <Panel className="gap-3">
      <div className="relative">
        <PoolSheet pool={pool} siblings={siblings} />
        <PoolDialog pool={pool} siblings={siblings} />
        <PoolAlertSettings pool={pool} />
        <FavoriteStar pool={pool} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Current Pool Price</Label>
          <div className="num text-sm font-semibold">
            <AnimatedNumber value={price} format={(v) => `${usd ? "$" : ""}${formatPrice(v)}`} />{" "}
            <span className="text-[11px] font-normal text-muted-foreground">{priceUnit}</span>
          </div>
        </div>
        <div>
          <Label>Total Value Locked</Label>
          <div className="num text-sm font-semibold">
            <AnimatedNumber value={pool.tvl} format={compactUsd} />
          </div>
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
        <span className="num ml-auto text-[13px] font-semibold">
          <AnimatedNumber value={token.amount} format={formatAmount} />
        </span>
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

export function LiquidityDistribution({ pool, chain }: { pool: PoolView; chain: ChainView | null }) {
  const [reach, setReach] = useState(20);
  const { tokenX: x, tokenY: y } = pool;
  const bars = chain ? binDistribution(chain.bins, chain.activeBinId, reach, x.price, y.price, MAX_BARS) : [];
  const zoom = "text-muted-foreground hover:text-foreground disabled:opacity-30";
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
      {bars.length === 0 ? (
        <p className="py-10 text-center text-xs text-muted-foreground">Could not read the pool's bins.</p>
      ) : (
        <BinChart bars={bars} x={x.symbol} y={y.symbol} poolPrice={pool.price} />
      )}
    </Panel>
  );
}

const signedUsd = (v: number) => `${v < 0 ? "-" : "+"}${compactUsd(Math.abs(v))}`;

export function AdvancedMetrics({ pool, now }: { pool: PoolView; now: number }) {
  const s = pool.stats;
  const n = (v: number | undefined) => v ?? NA;
  return (
    <Panel title="Advanced Metrics" className="gap-2">
      <Row label="Pool Age" value={age(pool.createdAt, now)} />
      <Row label="Volatility" value={n(s?.volatility)} format={(v) => v.toFixed(2)} />
      <Row label="Active TVL" value={n(s?.activeTvl)} format={compactUsd} />
      <Row label="Fees / Active TVL" value={n(s?.feeActiveTvl)} format={pct} />
      <Row label="Volume / Active TVL" value={n(s?.volumeActiveTvl)} format={(v) => `${v.toFixed(2)}x`} />
      <Row label="Total LPs" value={n(s?.totalLps)} format={compact} />
      <Row label="Unique LPs" value={n(s?.uniqueLps)} format={compact} />
      <Row label="Positions Created" value={n(s?.positionsCreated)} format={compact} />
      <Row label="Open Positions" value={n(s?.openPositions)} format={compact} />
      <Row label="In Range Positions" value={n(s?.inRangePositions)} format={compact} />
      <Row label="Avg Fees/Min" value={perMinute(pool.fees24h)} format={compactUsd} />
      <Row label="Avg Vol/Min" value={perMinute(pool.volume24h)} format={compactUsd} />
      <Row label="Traders" value={n(s?.traders)} format={compact} />
      <Row label="Swaps" value={n(s?.swaps)} format={compact} />
      <Row
        label="Net Deposits"
        value={n(s?.netDeposits)}
        format={signedUsd}
        className={s ? (s.netDeposits >= 0 ? "text-profit" : "text-loss") : ""}
      />
    </Panel>
  );
}
