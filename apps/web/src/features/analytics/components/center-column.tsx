import { Link } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Segmented } from "@/features/portfolio/components/segmented";
import { compactUsd, pct } from "@/features/portfolio/money";
import { type Currency, ratio, STAT_WINDOWS, TIMEFRAMES, type TimeframeId } from "../analytics";
import type { PoolView, SiblingPool } from "../analytics.types";
import { CandleChart, type ChartBar } from "./candle-chart";
import { Label, NA, Panel } from "./ui";

const usdOrNa = (v: number | null) => (v === null ? NA : compactUsd(v));

type StatItem = [label: string, value: string, color: string, tip?: string, sub?: string];

export function VolumeStats({ pool, volume7d }: { pool: PoolView; volume7d: number | null }) {
  const x = pool.tokenX;
  const day = pool.windows["24h"];
  const items: StatItem[] = [
    ["7d Volume", usdOrNa(volume7d), ""],
    ["24h Vol / TVL", `${ratio(day.volume, pool.tvl).toFixed(2)}x`, ""],
    [`${x.symbol} Buy Vol`, usdOrNa(x.flow["24h"]?.buy ?? null), "text-profit", TOKEN_WIDE],
    [`${x.symbol} Sell Vol`, usdOrNa(x.flow["24h"]?.sell ?? null), "text-loss", TOKEN_WIDE],
    ...STAT_WINDOWS.filter((w) => w !== "24h").map((w): StatItem => {
      const { volume, fees } = pool.windows[w];
      return [
        `${w} Volume`,
        compactUsd(volume),
        "",
        undefined,
        `${compactUsd(fees)} fees (${pct(ratio(fees, pool.tvl))})`,
      ];
    }),
  ];
  return (
    <Panel className="flex-row items-center gap-4 overflow-x-auto px-4 py-3 whitespace-nowrap">
      <div className="flex shrink-0 flex-col gap-0.5">
        <Label>24h Volume</Label>
        <span className="num text-xl font-bold">{compactUsd(day.volume)}</span>
        <span className="num text-[11px] text-muted-foreground">
          {compactUsd(day.fees)} fees ({pct(ratio(day.fees, pool.tvl))})
        </span>
      </div>
      {items.map(([label, value, color, tip, sub]) => (
        <div key={label} className="flex shrink-0 items-center gap-4">
          <span className="h-7.5 w-px bg-border" />
          <div className="flex flex-col gap-0.5" title={tip}>
            <Label>{label}</Label>
            <span className={`num text-sm font-semibold ${color}`}>{value}</span>
            {sub && <span className="num text-[11px] text-muted-foreground">{sub}</span>}
          </div>
        </div>
      ))}
    </Panel>
  );
}

const TOKEN_WIDE = "Token-wide across every market (Jupiter), not this pool alone";

const CHART_HEIGHT = { min: 340, start: 620, max: 1400 };

/** Room left in the scrolling column once everything else is laid out, or null when the column does not scroll. */
function fitHeight(el: HTMLElement, current: number) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (getComputedStyle(p).overflowY !== "auto") continue;
    return current - (p.scrollHeight - p.clientHeight) - 8;
  }
  return null;
}

export function ChartPanel({
  bars,
  tf,
  metric,
  currency,
  price,
  quote,
  onChange,
  onTimeframe,
  onNeedOlder,
  loadingOlder,
}: {
  bars: ChartBar[];
  tf: TimeframeId;
  metric: "volume" | "fees";
  currency: Currency;
  price: number;
  quote: string;
  onChange: (patch: { metric?: "volume" | "fees"; cur?: Currency }) => void;
  onTimeframe: (tf: TimeframeId) => void;
  onNeedOlder: () => void;
  loadingOlder: boolean;
}) {
  const [height, setHeight] = useState(CHART_HEIGHT.start);
  const box = useRef<HTMLDivElement>(null);
  // Start at the tallest chart that still leaves the column unscrolled; dragging the handle overrides it.
  useLayoutEffect(() => {
    const fit = box.current && fitHeight(box.current, CHART_HEIGHT.start);
    if (fit !== null && fit !== undefined) setHeight(Math.min(CHART_HEIGHT.start, Math.max(CHART_HEIGHT.min, fit)));
  }, []);
  const drag = useRef<{ y: number; height: number } | null>(null);
  return (
    <div ref={box} className="relative shrink-0" style={{ height }}>
      <Panel className="h-full min-h-0 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">{metric === "volume" ? "Volume" : "Fees"} Chart</h2>
          <span className="h-4 w-px bg-border" />
          <Segmented
            variant="muted"
            value={metric}
            onChange={(metric) => onChange({ metric })}
            options={[
              { value: "volume", label: "Volume" },
              { value: "fees", label: "Fees" },
            ]}
          />
          <Segmented
            variant="muted"
            value={tf}
            onChange={onTimeframe}
            options={TIMEFRAMES.map((t) => ({ value: t.id, label: t.label }))}
          />
          <div className="ml-auto">
            <Segmented
              variant="muted"
              value={currency}
              onChange={(cur) => onChange({ cur })}
              options={[
                { value: "native", label: quote },
                { value: "usd", label: "USD" },
              ]}
            />
          </div>
        </div>
        <CandleChart
          bars={bars}
          tf={tf}
          price={price}
          metric={metric}
          onNeedOlder={onNeedOlder}
          loadingOlder={loadingOlder}
          prefix={currency === "usd" ? "$" : ""}
          unit={currency === "usd" ? "USD" : quote}
        />
      </Panel>
      <button
        type="button"
        aria-label="Resize chart"
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          const delta = e.key === "ArrowUp" ? -24 : 24;
          setHeight((h) => Math.min(CHART_HEIGHT.max, Math.max(CHART_HEIGHT.min, h + delta)));
        }}
        className="absolute inset-x-0 -bottom-2 z-10 flex h-3 cursor-row-resize touch-none items-center justify-center"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, height };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const next = drag.current.height + e.clientY - drag.current.y;
          setHeight(Math.min(CHART_HEIGHT.max, Math.max(CHART_HEIGHT.min, next)));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <span className="h-1 w-12 rounded-full bg-muted-foreground/40 transition-colors hover:bg-brand" />
      </button>
    </div>
  );
}

/** Amounts under a cent read as `$<0.01` instead of rounding to `$0.00`. */
export const tinyUsd = (v: number) => (v > 0 && v < 0.01 ? "$<0.01" : compactUsd(v));

export function PoolCard({ pool, s, onSelect }: { pool: PoolView; s: SiblingPool; onSelect?: () => void }) {
  const active = s.address === pool.address;
  const rows = [
    ["TVL", tinyUsd(s.tvl)],
    ["24h Vol", tinyUsd(s.volume24h)],
    ["24h Fee", tinyUsd(s.fees24h)],
    ["24h Fee/TVL", pct(ratio(s.fees24h, s.tvl))],
  ] as const;
  return (
    <Link
      to="/analytics"
      search={(prev) => ({ ...prev, pool: s.address })}
      onClick={onSelect}
      className={`flex flex-col gap-2.5 rounded-lg border bg-muted/40 p-3 ${active ? "border-brand/60" : ""}`}
    >
      <div className="flex items-center gap-2 border-b pb-2.5 text-xs text-muted-foreground">
        <span>
          Bin Step: <b className="text-sm text-foreground">{s.binStep}</b>
        </span>
        <span>
          Fee: <b className="text-sm text-foreground">{Number(s.baseFeePct.toFixed(2))}%</b>
        </span>
        {active ? (
          <span className="rounded-md bg-brand/20 px-1.5 py-0.5 text-[11px] font-medium text-brand">Current</span>
        ) : (
          <ChevronRightIcon className="ml-auto size-4" />
        )}
      </div>
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="num text-sm font-semibold">{value}</span>
        </div>
      ))}
    </Link>
  );
}
