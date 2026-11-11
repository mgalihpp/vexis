import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { TIMEFRAMES, type TimeframeId } from "@/features/analytics/analytics";
import { PoolAddress } from "@/features/analytics/analytics.functions";
import { analyticsQuery, chartQuery, trackedQuery } from "@/features/analytics/analytics.queries";
import { AnalyticsPage } from "@/features/analytics/components/analytics-page";
import { AnalyticsSkeleton } from "@/features/analytics/components/analytics-skeleton";
import { usePools } from "@/stores/pools";
import { useSettings } from "@/stores/settings";

const TF_IDS = TIMEFRAMES.map((t) => t.id) as [TimeframeId, ...TimeframeId[]];

const defaults = { cur: "native", metric: "volume", token: "x" } as const;

const AnalyticsSearch = z.object({
  pool: PoolAddress.optional().catch(undefined),
  tf: z.enum(TF_IDS).optional().catch(undefined),
  cur: z.enum(["native", "usd"]).default(defaults.cur).catch(defaults.cur),
  metric: z.enum(["volume", "fees"]).default(defaults.metric).catch(defaults.metric),
  token: z.enum(["x", "y"]).default(defaults.token).catch(defaults.token),
});

export const Route = createFileRoute("/analytics")({
  validateSearch: AnalyticsSearch,
  search: { middlewares: [stripSearchParams({ ...defaults, tf: "1h" })] },
  loaderDeps: ({ search }) => ({
    pool: search.pool,
    tf: search.tf ?? useSettings.getState().analyticsTimeframe,
  }),
  loader: async ({ deps, context }) => {
    const { pool } = await context.queryClient.ensureQueryData(analyticsQuery({ pool: deps.pool }));
    // The server sends the chart with the page. In the browser a timeframe change only starts the chart's fetch, so
    // the page stays and the chart shows its own skeleton. prefetchQuery never throws; a failed chart retries there.
    const chart = context.queryClient.prefetchQuery(chartQuery({ pool: pool.address, tf: deps.tf }));
    if (typeof window === "undefined") await chart;
    // The tracked-wallets scan is slow (RPC plus one Meteora call per owner), so it starts here and never blocks the page.
    // Browser only: on the server a warm cache would stream the data in after the HTML already showed the skeleton,
    // and hydration would then see different markup.
    if (typeof window !== "undefined") void context.queryClient.prefetchQuery(trackedQuery({ pool: pool.address }));
    return { pair: `${pool.tokenX.symbol}-${pool.tokenY.symbol}` };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData ? `${loaderData.pair} | Vexis` : "Analytics | Vexis" }],
  }),
  pendingComponent: AnalyticsSkeleton,
  component: Analytics,
});

function Analytics() {
  const { pool, tf: searchTf, cur, metric, token } = Route.useSearch();
  const savedTf = useSettings((s) => s.analyticsTimeframe);
  const setAnalyticsTimeframe = useSettings((s) => s.setAnalyticsTimeframe);
  const tf = searchTf ?? savedTf;
  const { data } = useSuspenseQuery(analyticsQuery({ pool }));
  const navigate = Route.useNavigate();
  // With no pool in the URL, open the pool the user looked at last. The store rehydrates after mount, so this runs
  // once it has loaded; until then the page shows the default pool.
  const lastPool = usePools((s) => s.history[0]?.address);
  const recordPool = usePools((s) => s.recordHistory);
  useEffect(() => {
    if (!pool && lastPool) void navigate({ search: (prev) => ({ ...prev, pool: lastPool }), replace: true });
  }, [pool, lastPool, navigate]);
  // Only pools the user picked count as history; the default pool is not recorded.
  const loadedAddress = data.pool.address;
  const loadedName = data.pool.name;
  const loadedBinStep = data.pool.binStep;
  const loadedX = data.pool.tokenX;
  const loadedY = data.pool.tokenY;
  useEffect(() => {
    if (!pool) return;
    recordPool({
      address: loadedAddress,
      name: loadedName,
      binStep: loadedBinStep,
      tokenXSymbol: loadedX.symbol,
      tokenXIcon: loadedX.icon,
      tokenYSymbol: loadedY.symbol,
      tokenYIcon: loadedY.icon,
    });
  }, [
    pool,
    loadedAddress,
    loadedName,
    loadedBinStep,
    loadedX.symbol,
    loadedX.icon,
    loadedY.symbol,
    loadedY.icon,
    recordPool,
  ]);
  useEffect(() => {
    if (searchTf) setAnalyticsTimeframe(searchTf);
  }, [searchTf, setAnalyticsTimeframe]);
  return (
    <AnalyticsPage
      // Panned-back history and the chart's height belong to one pool, so a new pool starts fresh.
      key={data.pool.address}
      data={data}
      tf={tf}
      view={{ cur, metric, token }}
      onView={(patch) => navigate({ search: (prev) => ({ ...prev, ...patch }) })}
      onTimeframe={(timeframe) => {
        setAnalyticsTimeframe(timeframe);
        navigate({ search: (prev) => ({ ...prev, tf: timeframe }) });
      }}
    />
  );
}
