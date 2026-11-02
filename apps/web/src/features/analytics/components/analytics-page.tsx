import { useCallback, useMemo, useRef, useState } from "react";
import { type Bar, type Currency, convertBars, sumVolume, type TimeframeId, type VolumePoint } from "../analytics";
import { getOlderBars } from "../analytics.functions";
import type { loadAnalytics } from "../analytics.server";
import type { ChartBar } from "./candle-chart";
import { ChartPanel, VolumeStats } from "./center-column";
import { AdvancedMetrics, LiquidityDistribution, PoolHeader, PoolTokens } from "./left-column";
import { FeesPanel, Links, TokenInfo, TvlDistribution, VolumeSparkline } from "./right-column";

export type AnalyticsData = Awaited<ReturnType<typeof loadAnalytics>>;

export interface AnalyticsView {
  cur: Currency;
  metric: "volume" | "fees";
  token: "x" | "y";
}

/** Both lists are time-ordered; where they overlap the later list wins, since it is the fresher fetch. */
function mergeByTime<T extends { t: number }>(older: T[], latest: T[]): T[] {
  const byTime = new Map<number, T>();
  for (const item of older) byTime.set(item.t, item);
  for (const item of latest) byTime.set(item.t, item);
  return [...byTime.values()].sort((a, b) => a.t - b.t);
}

export function AnalyticsPage({
  data,
  view,
  onView,
  onTimeframe,
}: {
  data: AnalyticsData;
  view: AnalyticsView;
  onView: (patch: Partial<AnalyticsView>) => void;
  onTimeframe: (tf: TimeframeId) => void;
}) {
  const { pool, spark, siblings, now, tf, chain } = data;
  const yUsd = pool.tokenY.price;
  // Bars the user panned back to, kept apart from the loader's latest window, which refreshes every 15 s.
  const [older, setOlder] = useState<{ bars: Bar[]; history: VolumePoint[] }>({ bars: [], history: [] });
  const [loadingOlder, setLoadingOlder] = useState(false);
  const olderState = useRef<"idle" | "loading" | "done">("idle");
  const bars = useMemo(() => mergeByTime(older.bars, data.bars), [older.bars, data.bars]);
  const history = useMemo(() => mergeByTime(older.history, data.history), [older.history, data.history]);
  const oldest = bars[0]?.t;
  const needOlder = useCallback(() => {
    if (olderState.current !== "idle" || oldest === undefined) return;
    olderState.current = "loading";
    setLoadingOlder(true);
    getOlderBars({ data: { pool: pool.address, tf, before: oldest } })
      .then((r) => {
        if (r.bars.length === 0) {
          olderState.current = "done";
          return;
        }
        setOlder((o) => ({ bars: [...r.bars, ...o.bars], history: [...r.history, ...o.history] }));
        olderState.current = "idle";
      })
      .catch(() => {
        olderState.current = "done";
      })
      .finally(() => setLoadingOlder(false));
  }, [oldest, pool.address, tf]);

  const shown = convertBars(bars, view.cur, yUsd);
  const fees = new Map(
    convertBars(
      history.map((h) => ({ t: h.t, open: 0, high: 0, low: 0, close: 0, volume: h.fees })),
      view.cur,
      yUsd,
    ).map((h) => [h.t, h.volume]),
  );
  const chartBars: ChartBar[] = shown.map((b) => ({
    ...b,
    value: view.metric === "fees" ? (fees.get(b.t) ?? 0) : b.volume,
  }));
  const price = view.cur === "usd" ? pool.price * yUsd : pool.price;
  const quote = pool.tokenY.symbol;
  const priceUnit = view.cur === "usd" ? "USD" : `${quote}/${pool.tokenX.symbol}`;

  return (
    // Below xl the three columns collapse into one: the column wrappers become `contents` and each panel takes an
    // `order`, so a phone reads pool info, chart, bin steps, then the details.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 p-2 xl:h-full xl:grid-cols-[312px_minmax(0,1fr)_300px] xl:grid-rows-[minmax(0,1fr)] xl:overflow-hidden">
      <div className="flex flex-col gap-2 max-xl:contents xl:min-h-0 xl:overflow-y-auto">
        <div className="max-xl:order-1">
          <PoolHeader pool={pool} siblings={siblings} price={price} priceUnit={priceUnit} usd={view.cur === "usd"} />
        </div>
        <div className="max-xl:order-5">
          <PoolTokens pool={pool} />
        </div>
        <div className="max-xl:order-6">
          <LiquidityDistribution pool={pool} chain={chain} />
        </div>
        <div className="max-xl:order-7">
          <AdvancedMetrics pool={pool} now={now} />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-2 max-xl:contents xl:min-h-0 xl:overflow-y-auto">
        <div className="min-w-0 max-xl:order-2">
          <VolumeStats pool={pool} volume7d={spark.length > 0 ? sumVolume(spark) : null} />
        </div>
        <div className="max-xl:order-3">
          <ChartPanel
            bars={chartBars}
            tf={tf}
            metric={view.metric}
            currency={view.cur}
            price={price}
            quote={quote}
            onChange={onView}
            onTimeframe={onTimeframe}
            onNeedOlder={needOlder}
            loadingOlder={loadingOlder}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2 max-xl:contents xl:min-h-0 xl:overflow-y-auto">
        <div className="max-xl:order-8">
          <VolumeSparkline points={spark} />
        </div>
        <div className="max-xl:order-9">
          <TvlDistribution pool={pool} />
        </div>
        <div className="max-xl:order-10">
          <TokenInfo pool={pool} side={view.token} onSide={(token) => onView({ token })} now={now} />
        </div>
        <div className="max-xl:order-11">
          <FeesPanel pool={pool} />
        </div>
        <div className="max-xl:order-12">
          <Links pool={pool} />
        </div>
      </div>
    </div>
  );
}
