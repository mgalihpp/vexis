import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { TIMEFRAMES, type TimeframeId } from "@/features/analytics/analytics";
import { PoolAddress } from "@/features/analytics/analytics.functions";
import { analyticsQuery } from "@/features/analytics/analytics.queries";
import { AnalyticsPage } from "@/features/analytics/components/analytics-page";

const TF_IDS = TIMEFRAMES.map((t) => t.id) as [TimeframeId, ...TimeframeId[]];

const defaults = { tf: "1h", cur: "native", metric: "volume", token: "x" } as const;

const AnalyticsSearch = z.object({
  pool: PoolAddress.optional().catch(undefined),
  tf: z.enum(TF_IDS).default(defaults.tf).catch(defaults.tf),
  cur: z.enum(["native", "usd"]).default(defaults.cur).catch(defaults.cur),
  metric: z.enum(["volume", "fees"]).default(defaults.metric).catch(defaults.metric),
  token: z.enum(["x", "y"]).default(defaults.token).catch(defaults.token),
});

export const Route = createFileRoute("/analytics")({
  validateSearch: AnalyticsSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loaderDeps: ({ search }) => ({ pool: search.pool, tf: search.tf }),
  loader: async ({ deps, context }) => {
    await context.queryClient.ensureQueryData(analyticsQuery(deps));
  },
  head: () => ({ meta: [{ title: "Analytics · Vexis" }] }),
  pendingComponent: () => <div className="h-96 animate-pulse rounded-lg bg-card m-2" />,
  component: Analytics,
});

function Analytics() {
  const { pool, tf, cur, metric, token } = Route.useSearch();
  const { data } = useSuspenseQuery(analyticsQuery({ pool, tf }));
  const navigate = Route.useNavigate();
  return (
    <AnalyticsPage
      // Panned-back history belongs to one pool and timeframe, so a change of either starts fresh.
      key={`${data.pool.address}-${data.tf}`}
      data={data}
      view={{ cur, metric, token }}
      onView={(patch) => navigate({ search: (prev) => ({ ...prev, ...patch }) })}
      onTimeframe={(tf) => navigate({ search: (prev) => ({ ...prev, tf }) })}
    />
  );
}
