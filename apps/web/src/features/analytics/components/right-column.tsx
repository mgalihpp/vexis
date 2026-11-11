import { ExternalLinkIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { AnimatedNumber } from "@/components/animated-number";
import { TokenIcon, tradeLinks } from "@/features/portfolio/components/pool-identity";
import { Segmented } from "@/features/portfolio/components/segmented";
import { compactUsd, formatAmount, pct } from "@/features/portfolio/money";
import { offsetLabel, useTzOffset } from "@/features/timezone/timezone";
import { age, protocolFeePct, ratio, sumVolume, type VolumePoint } from "../analytics";
import type { PoolTokenView, PoolView } from "../analytics.types";
import { compact, Label, NA, Num, Panel, Row, signedPct } from "./ui";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const timeFmt = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

// The feed is 4-hour buckets, so the shortest range that is more than one point is 12h.
const SPARK_RANGES = [
  { value: "12h", label: "12h", bars: 3 },
  { value: "24h", label: "24h", bars: 6 },
  { value: "3d", label: "3d", bars: 18 },
  { value: "7d", label: "7d", bars: Number.POSITIVE_INFINITY },
] as const;

export function VolumeSparkline({ points: allPoints }: { points: VolumePoint[] }) {
  const offset = useTzOffset();
  const local = (t: number) => t + offset * 60_000;
  const [hover, setHover] = useState<number | null>(null);
  const [range, setRange] = useState<(typeof SPARK_RANGES)[number]["value"]>("7d");
  const bars = SPARK_RANGES.find((r) => r.value === range)?.bars ?? Number.POSITIVE_INFINITY;
  const points = bars >= allPoints.length ? allPoints : allPoints.slice(-bars);
  const w = 276;
  const h = 76;
  const max = Math.max(...points.map((p) => p.volume), 1e-12);
  const xs = (i: number) => (points.length < 2 ? 0 : (i / (points.length - 1)) * w);
  const ys = (v: number) => h - (v / max) * (h - 4) - 2;
  const line = points.map((p, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)} ${ys(p.volume).toFixed(1)}`).join(" ");
  const labels = [0, 1, 2, 3].map((i) => points[Math.round((i / 3) * (points.length - 1))]);
  const point = hover === null ? undefined : points[hover];
  const hoverX = hover === null ? 0 : xs(hover);
  const tipLeft = `calc(${(hoverX / w) * 100}% ${hoverX > w / 2 ? "- 9rem - 10px" : "+ 10px"})`;
  return (
    <Panel className="gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>Volume ({range})</Label>
        <Segmented
          variant="muted"
          value={range}
          onChange={(value) => {
            setRange(value);
            setHover(null);
          }}
          options={SPARK_RANGES}
        />
      </div>
      <span className="num text-lg font-bold">
        <AnimatedNumber value={sumVolume(points)} format={compactUsd} />
      </span>
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
              style={{ left: `clamp(0px, ${tipLeft}, calc(100% - 9rem))` }}
            >
              <div className="font-semibold">{dateFmt.format(local(point.t))}</div>
              <div className="num text-muted-foreground">
                {timeFmt.format(local(point.t))} {offsetLabel(offset)}, 4h
              </div>
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
          <span key={p?.t ?? 0}>{p ? dateFmt.format(local(p.t)) : ""}</span>
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
          <span className="font-semibold">
            <AnimatedNumber value={x.usd} format={compactUsd} />
          </span>{" "}
          <span className="text-muted-foreground">
            <AnimatedNumber value={xs} format={pct} />
          </span>
        </span>
        <span>
          <span className="font-semibold">
            <AnimatedNumber value={y.usd} format={compactUsd} />
          </span>{" "}
          <span className="text-muted-foreground">
            <AnimatedNumber value={1 - xs} format={pct} />
          </span>
        </span>
      </div>
    </Panel>
  );
}

function Cell({
  label,
  value,
  format,
  tone = "",
}: {
  label: string;
  value: ReactNode | number;
  format?: (value: number) => string;
  tone?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Label>{label}</Label>
      <span className={`num text-xs font-semibold ${tone}`}>
        <Num value={value} format={format} />
      </span>
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
        <Cell label="Market Cap" value={t.marketCap ?? NA} format={compactUsd} />
        <Cell label="FDV" value={t.fdv ?? NA} format={compactUsd} />
        <Cell label="Holders" value={t.holders ?? NA} format={compact} />
        <Cell label="Top 10 H." value={t.topHoldersPct ?? NA} format={(v) => `${v.toFixed(2)}%`} />
        <Cell label="Dev Mints" value={t.devMints ?? NA} />
        <Cell label="Freeze Auth." value={t.freezeAuthorityDisabled ? "Disabled" : "Enabled"} />
        <Cell label="Mint Auth." value={t.mintAuthority === null ? "Disabled" : "Enabled"} />
        <Cell label="Total Supply" value={t.totalSupply} format={formatAmount} />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {(["5m", "1h", "6h", "24h"] as const).map((k) => {
          const v = t.changes[k];
          return (
            <div key={k} className="flex flex-col gap-0.5 rounded-md bg-muted px-2 py-1.5">
              <Label>{k}</Label>
              <span className={`num text-xs font-semibold ${v === null ? "" : v >= 0 ? "text-profit" : "text-loss"}`}>
                <Num value={v ?? NA} format={signedPct} />
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
      <Row label="Base Fee" value={pool.baseFeePct / 100} format={pct} />
      <Row label="Dynamic Fee" value={pool.dynamicFeePct / 100} format={(v) => pct(v, 3)} />
      <Row label="Total Trading Fee" value={(pool.baseFeePct + pool.dynamicFeePct) / 100} format={pct} />
      <Row label="Max Fee" value={pool.maxFeePct > 0 ? pool.maxFeePct / 100 : NA} format={pct} />
      <Row
        label="Protocol Fee"
        value={protocolFeePct(pool.baseFeePct, pool.protocolCutPct) / 100}
        format={(v) => pct(v, 3)}
      />
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
  const items = tradeLinks(pool.tokenX.address, pool.tokenY.address);
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
