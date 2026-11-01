import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { TokenIcon } from "@/features/portfolio/components/pool-identity";
import { Segmented } from "@/features/portfolio/components/segmented";
import { compactUsd, formatAmount, pct } from "@/features/portfolio/money";
import { age, protocolFeePct, ratio, sumVolume, type VolumePoint } from "../analytics";
import type { PoolTokenView, PoolView } from "../analytics.types";
import { compact, Label, NA, Panel, Row, signedPct } from "./ui";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

export function VolumeSparkline({ points }: { points: VolumePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 276;
  const h = 76;
  const max = Math.max(...points.map((p) => p.volume), 1e-12);
  const xs = (i: number) => (points.length < 2 ? 0 : (i / (points.length - 1)) * w);
  const ys = (v: number) => h - (v / max) * (h - 4) - 2;
  const line = points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(p.volume).toFixed(1)}`).join(" ");
  const labels = [0, 1, 2, 3].map((i) => points[Math.round((i / 3) * (points.length - 1))]);
  const point = hover === null ? undefined : points[hover];
  return (
    <Panel className="gap-1.5">
      <Label>Volume (7d)</Label>
      <span className="num text-lg font-bold">{compactUsd(sumVolume(points))}</span>
      {points.length < 2 ? (
        <div className="h-19 text-xs text-muted-foreground">No history yet.</div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${w} ${h}`}
            className="w-full"
            role="img"
            aria-label="Volume over seven days"
            onMouseLeave={() => setHover(null)}
            onMouseMove={(e) => {
              const box = e.currentTarget.getBoundingClientRect();
              const f = (e.clientX - box.left) / box.width;
              setHover(Math.min(points.length - 1, Math.max(0, Math.round(f * (points.length - 1)))));
            }}
          >
            <path d={`${line} L${w} ${h} L0 ${h} Z`} fill="var(--sol)" opacity={0.18} />
            <path d={line} fill="none" stroke="var(--sol)" strokeWidth={1.5} />
            {point && hover !== null && (
              <>
                <line
                  x1={xs(hover)}
                  x2={xs(hover)}
                  y1={0}
                  y2={h}
                  className="stroke-foreground/30"
                  strokeDasharray="2 3"
                />
                <circle cx={xs(hover)} cy={ys(point.volume)} r={3} fill="var(--sol)" />
              </>
            )}
          </svg>
          {point && hover !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-36 rounded-lg border bg-popover/95 p-2.5 text-[11px] shadow-xl backdrop-blur"
              style={{
                left: `${(xs(hover) / w) * 100}%`,
                transform: hover > points.length / 2 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
              }}
            >
              <div className="font-semibold">{dateFmt.format(point.t)}</div>
              <div className="num text-muted-foreground">{timeFmt.format(point.t)} UTC, 4h</div>
              <div className="num mt-2 flex items-center justify-between">
                <span className="text-muted-foreground">Volume</span>
                <span className="font-semibold">{compactUsd(point.volume)}</span>
              </div>
              <div className="num mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Fees</span>
                <span className="font-semibold">{compactUsd(point.fees)}</span>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        {labels.map((p) => (
          <span key={p?.t ?? 0}>{p ? dateFmt.format(p.t) : ""}</span>
        ))}
      </div>
    </Panel>
  );
}

export function TvlDistribution({ pool }: { pool: PoolView }) {
  const { tokenX: x, tokenY: y } = pool;
  const total = x.usd + y.usd;
  const xs = ratio(x.usd, total);
  return (
    <Panel
      title="TVL Distribution"
      aside={
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <i className="size-1.5 rounded-full bg-brand" />
            {x.symbol}
          </span>
          <span className="flex items-center gap-1">
            <i className="size-1.5 rounded-full" style={{ background: "var(--sol)" }} />
            {y.symbol}
          </span>
        </div>
      }
    >
      <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: "var(--sol)" }}>
        <div className="bg-brand" style={{ width: `${xs * 100}%` }} />
      </div>
      <div className="num flex justify-between text-[11px]">
        <span>
          <span className="font-semibold">{compactUsd(x.usd)}</span>{" "}
          <span className="text-muted-foreground">{pct(xs)}</span>
        </span>
        <span>
          <span className="font-semibold">{compactUsd(y.usd)}</span>{" "}
          <span className="text-muted-foreground">{pct(1 - xs)}</span>
        </span>
      </div>
    </Panel>
  );
}

function Cell({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label>{label}</Label>
      <span className={`num text-xs font-semibold ${tone}`}>{value}</span>
    </div>
  );
}

export function TokenInfo({
  pool,
  side,
  onSide,
  now,
}: {
  pool: PoolView;
  side: "x" | "y";
  onSide: (side: "x" | "y") => void;
  now: number;
}) {
  const t: PoolTokenView = side === "x" ? pool.tokenX : pool.tokenY;
  const cap = (v: number | null) => (v === null ? NA : compactUsd(v));
  return (
    <Panel
      title="Token Info"
      aside={
        <Segmented
          variant="muted"
          value={side}
          onChange={onSide}
          options={[
            { value: "x", label: pool.tokenX.symbol },
            { value: "y", label: pool.tokenY.symbol },
          ]}
        />
      }
      className="gap-3"
    >
      <div className="grid grid-cols-3 gap-y-3">
        <Cell label="Age" value={t.createdAt === null ? NA : age(t.createdAt, now)} />
        <Cell label="Market Cap" value={cap(t.marketCap)} />
        <Cell label="FDV" value={cap(t.fdv)} />
        <Cell label="Holders" value={compact(t.holders)} />
        <Cell label="Top 10 H." value={t.topHoldersPct === null ? NA : `${t.topHoldersPct.toFixed(2)}%`} />
        <Cell label="Dev Mints" value={t.devMints === null ? NA : String(t.devMints)} />
        <Cell label="Freeze Auth." value={t.freezeAuthorityDisabled ? "Disabled" : "Enabled"} />
        <Cell label="Mint Auth." value={t.mintAuthority === null ? "Disabled" : "Enabled"} />
        <Cell label="Total Supply" value={formatAmount(t.totalSupply)} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {(["5m", "1h", "6h", "24h"] as const).map((k) => {
          const v = t.changes[k];
          return (
            <div key={k} className="flex flex-col gap-0.5 rounded-md bg-muted px-2 py-1.5">
              <Label>{k}</Label>
              <span className={`num text-xs font-semibold ${v === null ? "" : v >= 0 ? "text-profit" : "text-loss"}`}>
                {v === null ? NA : signedPct(v)}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export function FeesPanel({ pool }: { pool: PoolView }) {
  const { tokenX: x, tokenY: y } = pool;
  const chips = [
    { key: "x", on: false, icons: [x], label: x.symbol },
    { key: "y", on: pool.feeMode === "quote", icons: [y], label: y.symbol },
    { key: "both", on: pool.feeMode === "both", icons: [x, y], label: "Base + Quote" },
  ];
  return (
    <Panel title="Fees">
      <Row label="Bin Step" value={pool.binStep} />
      <Row label="Base Fee" value={pct(pool.baseFeePct / 100)} />
      <Row label="Dynamic Fee" value={pct(pool.dynamicFeePct / 100, 3)} />
      <Row label="Total Trading Fee" value={pct((pool.baseFeePct + pool.dynamicFeePct) / 100)} />
      <Row label="Max Fee" value={pool.maxFeePct > 0 ? pct(pool.maxFeePct / 100) : NA} />
      <Row label="Protocol Fee" value={pct(protocolFeePct(pool.baseFeePct, pool.protocolCutPct) / 100, 3)} />
      <Row label="Limit Order Bonus" value={NA} />
      <Label>Fee Collection Token</Label>
      <div className="flex gap-1.5">
        {chips.map((c) => (
          <span
            key={c.key}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] ${
              c.on ? "border-brand bg-brand/15 text-brand" : "text-muted-foreground"
            }`}
          >
            <span className="flex">
              {c.icons.map((t, i) => (
                <TokenIcon
                  key={t.address}
                  token={t}
                  className={`relative size-3.5 text-[8px] ${i ? "-ml-1" : "z-10"}`}
                />
              ))}
            </span>
            {c.label}
          </span>
        ))}
      </div>
    </Panel>
  );
}

const linkClass =
  "flex flex-1 items-center justify-between rounded-md border px-2.5 py-1.5 text-xs font-medium hover:border-brand hover:text-brand";

export function Links({ pool }: { pool: PoolView }) {
  const items = [
    {
      name: "Jupiter",
      logo: "/brands/jupiter.png",
      href: `https://jup.ag/swap/${pool.tokenX.address}-${pool.tokenY.address}`,
    },
    { name: "GMGN", logo: "/brands/gmgn.png", href: `https://gmgn.ai/sol/token/${pool.tokenX.address}` },
  ];
  return (
    <Panel title="Trade & Charts">
      <div className="flex gap-2">
        {items.map((i) => (
          <a key={i.name} className={linkClass} href={i.href} target="_blank" rel="noreferrer">
            <span className="flex items-center gap-1.5">
              <img src={i.logo} alt="" className="size-4 rounded-sm" />
              {i.name}
            </span>
            <ExternalLinkIcon className="size-3" />
          </a>
        ))}
      </div>
    </Panel>
  );
}
