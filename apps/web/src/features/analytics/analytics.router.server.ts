import { z } from "zod";
import { PoolAddress } from "@/lib/address";
import { router, viewerProcedure } from "@/trpc/init.server";
import { TIMEFRAMES, type TimeframeId } from "./analytics";
import { loadAnalytics, loadChart, loadOlder, searchPools } from "./analytics.server";
import { trackedPositions } from "./tracked.server";
import { loadTraders } from "./traders.server";

const TF_IDS = TIMEFRAMES.map((t) => t.id) as [TimeframeId, ...TimeframeId[]];

const TrackedInput = z.object({
  pool: PoolAddress,
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.union([z.literal(10), z.literal(25), z.literal(50)]).default(10),
  refresh: z.boolean().default(false),
  query: z.string().trim().max(44).default(""),
  range: z
    .array(z.enum(["in", "out"]))
    .max(2)
    .default([]),
  pnl: z
    .array(z.enum(["profit", "loss"]))
    .max(2)
    .default([]),
  sort: z.enum(["recent", "liquidity"]).default("recent"),
});

export const analyticsRouter = router({
  get: viewerProcedure.input(z.object({ pool: PoolAddress.optional() })).query(({ input }) => loadAnalytics(input)),
  chart: viewerProcedure
    .input(z.object({ pool: PoolAddress, tf: z.enum(TF_IDS) }))
    .query(({ input }) => loadChart(input)),
  search: viewerProcedure
    .input(z.object({ query: z.string().trim().max(44) }))
    .query(({ input }) => searchPools(input.query)),
  tracked: viewerProcedure
    .input(TrackedInput)
    .query(({ input }) =>
      trackedPositions(
        input.pool,
        input.page,
        input.pageSize,
        input.refresh,
        { query: input.query, range: new Set(input.range), pnl: new Set(input.pnl) },
        input.sort,
      ),
    ),
  olderBars: viewerProcedure
    .input(z.object({ pool: PoolAddress, tf: z.enum(TF_IDS), before: z.number().int().positive() }))
    .query(({ input }) => loadOlder(input)),
  traders: viewerProcedure.input(z.object({ pool: PoolAddress })).query(({ input }) => loadTraders(input.pool)),
});
