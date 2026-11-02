import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { TIMEFRAMES, type TimeframeId } from "@/features/analytics/analytics";
import { PoolAddress } from "@/features/analytics/analytics.functions";
import { analyticsQuery, chartQuery } from "@/features/analytics/analytics.queries";
import { AnalyticsPage } from "@/features/analytics/components/analytics-page";
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
  },
  head: () => ({ meta: [{ title: "Analytics · Vexis" }] }),
  pendingComponent: () => <div className="h-96 animate-pulse rounded-lg bg-card m-2" />,
  component: Analytics,
});

function Analytics() {
  const { pool, tf: searchTf, cur, metric, token } = Route.useSearch();
  const savedTf = useSettings((s) => s.analyticsTimeframe);
  const setAnalyticsTimeframe = useSettings((s) => s.setAnalyticsTimeframe);
  const tf = searchTf ?? savedTf;
  const { data } = useSuspenseQuery(analyticsQuery({ pool }));
  const navigate = Route.useNavigate();
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
