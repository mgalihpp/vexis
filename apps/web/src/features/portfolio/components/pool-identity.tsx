import { ActivityIcon, BadgeCheckIcon, CircleDollarSignIcon, FootprintsIcon, LeafIcon, ShieldIcon } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { shortAddr } from "@/lib/format";
import { pct } from "../money";
import type { PoolMeta, Token } from "../portfolio";

export function TokenIcon({ token, className = "" }: { token: Token; className?: string }) {
  const [failed, setFailed] = useState(false);
  // An image that fails before hydration never reaches React's onError.
  const check = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (!token.icon || failed) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground/80 ${className}`}
      >
        {token.symbol.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      ref={check}
      src={token.icon}
      alt={token.symbol}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full object-cover ${className}`}
    />
  );
}

const badge = "inline-flex items-center gap-0.75 rounded px-1 py-0.5 text-xs tabular-nums";

const TONES = {
  red: "bg-red-500/15 text-red-600 dark:text-red-400",
  orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  blue: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  purple: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  green: "bg-green-500/15 text-green-700 dark:text-green-400",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
} as const;

function Badge({ tone, title, children }: { tone: keyof typeof TONES; title: string; children: ReactNode }) {
  return (
    <span className={`${badge} ${TONES[tone]}`} title={title}>
      {children}
    </span>
  );
}

export function PoolBadges({ pool }: { pool: PoolMeta }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge tone="red" title="Meteora DLMM pool">
        DLMM
      </Badge>
      <Badge tone="blue" title="Bin step">
        <FootprintsIcon className="size-3.5" />
        {pool.binStep}
      </Badge>
      <Badge tone="orange" title="Base fee">
        <CircleDollarSignIcon className="size-3.5" />
        {pct(pool.baseFee / 100)}
      </Badge>
      {pool.dynamicFee !== null && (
        <Badge tone="purple" title="Dynamic fee">
          <ActivityIcon className="size-3.5" />
          {pct(pool.dynamicFee / 100)}
        </Badge>
      )}
    </div>
  );
}

function TokenScores({ token }: { token: Token }) {
  return (
    <>
      {token.organicScore !== null && (
        <Badge tone="green" title="Jupiter organic score (0-100)">
          <LeafIcon className="size-3" />
          {Math.round(token.organicScore)}
        </Badge>
      )}
      {token.risks !== null && (
        <Tooltip>
          <TooltipTrigger
            aria-label={`${token.risks.length} audit warnings`}
            className={`${badge} ${token.risks.length ? TONES.red : TONES.green}`}
          >
            <ShieldIcon className="size-3" />
            {token.risks.length}
          </TooltipTrigger>
          <TooltipContent className="max-w-48">
            {token.risks.length ? token.risks.join(" · ") : "No audit warnings from Jupiter"}
          </TooltipContent>
        </Tooltip>
      )}
    </>
  );
}

const LINKS = [
  { name: "Meteora", icon: "meteora", href: (p: PoolMeta) => `https://app.meteora.ag/dlmm/${p.address}` },
  { name: "Jupiter", icon: "jupiter", href: (p: PoolMeta) => `https://jup.ag/tokens/${p.tokenX.mint}` },
  { name: "DexScreener", icon: "dexscreener", href: (p: PoolMeta) => `https://dexscreener.com/solana/${p.address}` },
  { name: "GMGN", icon: "gmgn", href: (p: PoolMeta) => `https://gmgn.ai/sol/token/${p.tokenX.mint}` },
  { name: "Axiom", icon: "axiom", href: (p: PoolMeta) => `https://axiom.trade/meme/${p.address}` },
  { name: "Pump.fun", icon: "pumpfun", href: (p: PoolMeta) => `https://pump.fun/coin/${p.tokenX.mint}` },
  { name: "RugCheck", icon: "rugcheck", href: (p: PoolMeta) => `https://rugcheck.xyz/tokens/${p.tokenX.mint}` },
] as const;

export function PoolLinks({ pool }: { pool: PoolMeta }) {
  return (
    <div className="flex items-center gap-1.5">
      {LINKS.map((l) => (
        <a
          key={l.name}
          href={l.href(pool)}
          target="_blank"
          rel="noreferrer"
          aria-label={`${pool.pair} on ${l.name}`}
          title={l.name}
          className="opacity-90 transition-opacity hover:opacity-100"
        >
          <img src={`/links/${l.icon}.png`} alt="" className="size-3.5 rounded-[0.15rem]" />
        </a>
      ))}
    </div>
  );
}

export function SolscanLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title="Solscan"
      className="shrink-0 opacity-90 transition-opacity hover:opacity-100"
    >
      <img src="/links/solscan.png" alt="" className="size-3.5 rounded-full" />
    </a>
  );
}

export function PoolIdentity({ pool }: { pool: PoolMeta }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <div className="relative rounded-md border-2 border-brand p-0.5">
          <TokenIcon token={pool.tokenX} className="size-10 text-base" />
          <img
            src="/links/meteora.png"
            alt="Meteora"
            className="absolute -right-1.5 -bottom-1.5 size-5 rounded-full ring-2 ring-brand"
          />
        </div>
        <a
          href={`https://solscan.io/token/${pool.tokenX.mint}`}
          target="_blank"
          rel="noreferrer"
          className="text-[0.625rem] text-muted-foreground hover:text-brand"
        >
          {shortAddr(pool.tokenX.mint)}
        </a>
      </div>
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-0.5">
          <a
            href={`https://app.meteora.ag/dlmm/${pool.address}`}
            target="_blank"
            rel="noreferrer"
            className="mr-0.5 flex items-center gap-0.75 text-sm font-bold whitespace-nowrap hover:text-brand"
          >
            {pool.pair}
            {pool.tokenX.verified && <BadgeCheckIcon aria-label="Verified" className="size-4 text-profit" />}
          </a>
          <TokenScores token={pool.tokenX} />
        </div>
        <PoolBadges pool={pool} />
        <div className="pt-1.5">
          <PoolLinks pool={pool} />
        </div>
      </div>
    </div>
  );
}
