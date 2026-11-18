import {
  ActivityIcon,
  BadgeCheckIcon,
  CircleDollarSignIcon,
  ExternalLinkIcon,
  FootprintsIcon,
  LeafIcon,
  ShieldIcon,
} from "lucide-react";
import { type PointerEvent, type ReactNode, useCallback, useRef, useState } from "react";
import { InfoTip } from "@/components/info-tip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { shortAddr } from "@/lib/format";
import { pct } from "../money";
import type { PoolMeta, Token } from "../portfolio";

/**
 * Rewrite IPFS gateway URLs to a more reliable public gateway.
 *
 * Many token icons are hosted on IPFS and referenced via `ipfs.io`, which
 * aggressively rate-limits (429) or returns Cloudflare challenge pages whose
 * `Cross-Origin-Resource-Policy: same-origin` header causes the browser to
 * block the image with `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`.
 *
 * Pinata's public gateway reliably serves these images with `ACAO: *` and no
 * restrictive CORP header (verified 2026-11-02).
 */
const IPFS_GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://4everland.io/ipfs/"];

const IPFS_PATH_RE = /^https?:\/\/[^/]+\/ipfs\/(.+)$/;
const IPFS_PROTO_RE = /^ipfs:\/\/(.+)$/;

function rewriteIpfs(url: string, gatewayIndex = 0): string {
  const gw = IPFS_GATEWAYS[gatewayIndex] ?? IPFS_GATEWAYS[0] ?? "";
  const pathMatch = IPFS_PATH_RE.exec(url);
  if (pathMatch) return `${gw}${pathMatch[1]}`;
  const protoMatch = IPFS_PROTO_RE.exec(url);
  if (protoMatch) return `${gw}${protoMatch[1]}`;
  return url;
}

function isIpfsUrl(url: string): boolean {
  return IPFS_PATH_RE.test(url) || IPFS_PROTO_RE.test(url);
}

export function TokenIcon({ token, className = "" }: { token: Pick<Token, "symbol" | "icon">; className?: string }) {
  const [failCount, setFailCount] = useState(0);
  // An image that fails before hydration never reaches React's onError.
  const check = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth === 0) setFailCount((c) => c + 1);
  }, []);

  const icon = token.icon;
  const ipfs = icon ? isIpfsUrl(icon) : false;
  // For IPFS URLs we try each gateway before giving up; for normal URLs one failure is final.
  const maxAttempts = ipfs ? IPFS_GATEWAYS.length : 1;
  const exhausted = !icon || failCount >= maxAttempts;

  if (exhausted) {
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-foreground/80 ${className}`}
      >
        {token.symbol.slice(0, 1)}
      </span>
    );
  }

  const src = ipfs ? rewriteIpfs(icon, failCount) : icon;
  return (
    <img
      ref={check}
      src={src}
      alt={token.symbol}
      onError={() => setFailCount((c) => c + 1)}
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

export function Badge({ tone, title, children }: { tone: keyof typeof TONES; title: string; children: ReactNode }) {
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

export function OrganicScore({ score }: { score: number }) {
  return (
    <Badge tone="green" title="Jupiter organic score (0-100)">
      <LeafIcon className="size-3" />
      {Math.round(score)}
    </Badge>
  );
}

export function TokenScores({ token }: { token: Token }) {
  return (
    <>
      {token.organicScore !== null && <OrganicScore score={token.organicScore} />}
      {token.risks !== null && (
        <InfoTip
          aria-label={`${token.risks.length} audit warnings`}
          className={`${badge} ${token.risks.length ? TONES.red : TONES.green}`}
          content={token.risks.length ? token.risks.join(" · ") : "No audit warnings from Jupiter"}
          contentClassName="max-w-48"
        >
          <ShieldIcon className="size-3" />
          {token.risks.length}
        </InfoTip>
      )}
    </>
  );
}

const LINKS = [
  { name: "Meteora", icon: "meteora", href: (p: PoolMeta) => `https://app.meteora.ag/dlmm/${p.address}` },
  { name: "HawkFi", icon: "hawkfi", href: (p: PoolMeta) => hawkfiUrl(p.address) },
  { name: "Jupiter", icon: "jupiter", href: (p: PoolMeta) => `https://jup.ag/tokens/${p.tokenX.mint}` },
  { name: "DexScreener", icon: "dexscreener", href: (p: PoolMeta) => `https://dexscreener.com/solana/${p.address}` },
  { name: "GMGN", icon: "gmgn", href: (p: PoolMeta) => `https://gmgn.ai/sol/token/${p.tokenX.mint}` },
  { name: "Axiom", icon: "axiom", href: (p: PoolMeta) => `https://axiom.trade/meme/${p.address}` },
  { name: "Pump.fun", icon: "pumpfun", href: (p: PoolMeta) => `https://pump.fun/coin/${p.tokenX.mint}` },
  { name: "RugCheck", icon: "rugcheck", href: (p: PoolMeta) => `https://rugcheck.xyz/tokens/${p.tokenX.mint}` },
  { name: "Bubblemaps", icon: "bubblemaps", href: (p: PoolMeta) => bubblemapsUrl(p.tokenX.mint) },
] as const;

export const bubblemapsUrl = (mint: string) => `https://v2.bubblemaps.io/map?address=${mint}&chain=solana`;
const hawkfiUrl = (pool: string) => `https://www.hawkfi.ag/meteora/${pool}?create=true`;

/** Where to trade or chart a pool, shared by Analytics' Trade & Charts panel and the screener rows. */
export const tradeLinks = (pool: string, x: string) => [
  { name: "Meteora", logo: "/links/meteora.png", href: `https://app.meteora.ag/dlmm/${pool}` },
  { name: "HawkFi", logo: "/links/hawkfi.png", href: hawkfiUrl(pool) },
  { name: "Jupiter", logo: "/brands/jupiter.png", href: `https://jup.ag/tokens/${x}` },
  { name: "GMGN", logo: "/brands/gmgn.png", href: `https://gmgn.ai/sol/token/${x}` },
  { name: "Bubblemaps", logo: "/links/bubblemaps.png", href: bubblemapsUrl(x) },
];

const STACK_SHOWN = 3;

/**
 * The first few link icons stacked with a "+N" count; hovering (or tapping) opens a popover with every link. It stays
 * open while the pointer is over the trigger or the popover, so the links inside can be clicked.
 */
export function LinkStack({ label, links }: { label: string; links: { name: string; logo: string; href: string }[] }) {
  const [open, setOpen] = useState(false);
  const closing = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mouse = useRef(false);
  const hold = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(closing.current);
    setOpen(true);
  };
  const release = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    closing.current = setTimeout(() => setOpen(false), 150);
  };
  const rest = links.length - STACK_SHOWN;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${label} links`}
        className="relative z-10 flex shrink-0 cursor-pointer items-center"
        onPointerDown={(e) => {
          mouse.current = e.pointerType === "mouse";
        }}
        onPointerEnter={hold}
        onPointerLeave={release}
        onClick={(e) => mouse.current && e.preventDefault()}
      >
        {links.slice(0, STACK_SHOWN).map((l, i) => (
          <img
            key={l.name}
            src={l.logo}
            alt=""
            style={{ zIndex: STACK_SHOWN - i }}
            className="relative size-3.5 shrink-0 rounded-[0.2rem] ring-2 ring-card not-first:-ml-1"
          />
        ))}
        {rest > 0 && <span className="ml-1 text-[0.625rem] text-muted-foreground tabular-nums">+{rest}</span>}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        className="w-fit gap-0 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={hold}
        onPointerLeave={release}
      >
        {links.map((l) => (
          <a
            key={l.name}
            href={l.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`${label} on ${l.name}`}
            className="flex items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent hover:text-accent-foreground"
          >
            <img src={l.logo} alt="" className="size-3.5 rounded-[0.15rem]" />
            {l.name}
            <ExternalLinkIcon className="ml-auto size-3 shrink-0 text-muted-foreground" />
          </a>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function PoolLinks({ pool }: { pool: PoolMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {LINKS.map((l) => (
        <a
          key={l.name}
          href={l.href(pool)}
          target="_blank"
          rel="noreferrer"
          aria-label={`${pool.pair} on ${l.name}`}
          title={l.name}
          className="shrink-0 opacity-90 transition-opacity hover:opacity-100"
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
