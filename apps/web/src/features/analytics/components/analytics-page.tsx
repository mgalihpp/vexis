import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { type Bar, type Currency, convertBars, sumVolume, type TimeframeId, type VolumePoint } from "../analytics";
import { getOlderBars } from "../analytics.functions";
import { chartQuery } from "../analytics.queries";
import type { loadAnalytics } from "../analytics.server";
import type { ChartBar } from "./candle-chart";
import { ChartPanel, VolumeStats } from "./center-column";
import { AdvancedMetrics, LiquidityDistribution, PoolHeader, PoolTokens } from "./left-column";
import { FeesPanel, Links, TokenInfo, TvlDistribution, VolumeSparkline } from "./right-column";
import { TrackedWallets } from "./tracked-wallets";

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
  tf,
  view,
  onView,
  onTimeframe,
}: {
  data: AnalyticsData;
  tf: TimeframeId;
  view: AnalyticsView;
  onView: (patch: Partial<AnalyticsView>) => void;
  onTimeframe: (tf: TimeframeId) => void;
}) {
  const { pool, spark, siblings, now, chain } = data;
  const yUsd = pool.tokenY.price;
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
          <Chart
            pool={pool.address}
            tf={tf}
            view={view}
            yUsd={yUsd}
            price={price}
            quote={quote}
            onView={onView}
            onTimeframe={onTimeframe}
          />
        </div>
        <div className="max-xl:order-4">
          <TrackedWallets pool={pool.address} base={pool.tokenX} quote={pool.tokenY} />
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

const NO_OLDER = { bars: [] as Bar[], history: [] as VolumePoint[] };

/** The chart reads its own query, so a timeframe change shows a skeleton here and leaves the rest of the page alone. */
function Chart({
  pool,
  tf,
  view,
  yUsd,
  price,
  quote,
  onView,
  onTimeframe,
}: {
  pool: string;
  tf: TimeframeId;
  view: AnalyticsView;
  yUsd: number;
  price: number;
  quote: string;
  onView: (patch: Partial<AnalyticsView>) => void;
  onTimeframe: (tf: TimeframeId) => void;
}) {
  const { data } = useQuery(chartQuery({ pool, tf }));
  // Bars the user panned back to, kept apart from the latest window, which refreshes every 15 s. They belong to one
  // timeframe, so a change of timeframe starts fresh.
  const [older, setOlder] = useState({ tf, ...NO_OLDER });
  const olderState = useRef<{ tf: TimeframeId; state: "idle" | "loading" | "done" }>({ tf, state: "idle" });
  const [loadingOlder, setLoadingOlder] = useState(false);
  if (older.tf !== tf) setOlder({ tf, ...NO_OLDER });
  if (olderState.current.tf !== tf) olderState.current = { tf, state: "idle" };
  const kept = older.tf === tf ? older : NO_OLDER;
  const bars = useMemo(() => mergeByTime(kept.bars, data?.bars ?? []), [kept.bars, data?.bars]);
  const history = useMemo(() => mergeByTime(kept.history, data?.history ?? []), [kept.history, data?.history]);
  const oldest = bars[0]?.t;
  const needOlder = useCallback(() => {
    const status = olderState.current;
    if (status.state !== "idle" || oldest === undefined) return;
    status.state = "loading";
    setLoadingOlder(true);
    getOlderBars({ data: { pool, tf, before: oldest } })
      .then((r) => {
        if (r.bars.length === 0) {
          status.state = "done";
          return;
        }
        setOlder((o) =>
          o.tf === tf ? { tf, bars: [...r.bars, ...o.bars], history: [...r.history, ...o.history] } : o,
        );
        status.state = "idle";
      })
      .catch(() => {
        status.state = "done";
      })
      .finally(() => setLoadingOlder(false));
  }, [oldest, pool, tf]);

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
  return (
    <ChartPanel
      bars={data ? chartBars : null}
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
  );
}
