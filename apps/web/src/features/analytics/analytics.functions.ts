import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireViewer } from "@/features/auth/auth.middleware";
import { TIMEFRAMES, type TimeframeId } from "./analytics";
import { loadAnalytics, loadChart, loadOlder, searchPools } from "./analytics.server";
import { trackedPositions } from "./tracked.server";
import { loadTraders } from "./traders.server";

const TF_IDS = TIMEFRAMES.map((t) => t.id) as [TimeframeId, ...TimeframeId[]];
export const PoolAddress = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Not a Solana address");

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(z.object({ pool: PoolAddress.optional() }))
  .handler(({ data }) => loadAnalytics(data));

export const getChart = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(z.object({ pool: PoolAddress, tf: z.enum(TF_IDS) }))
  .handler(({ data }) => loadChart(data));

export const findPools = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(z.object({ query: z.string().trim().max(44) }))
  .handler(({ data }) => searchPools(data.query));

export const getTrackedPositions = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(
    z.object({
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
    }),
  )
  .handler(({ data }) =>
    trackedPositions(
      data.pool,
      data.page,
      data.pageSize,
      data.refresh,
      { query: data.query, range: new Set(data.range), pnl: new Set(data.pnl) },
      data.sort,
    ),
  );

export const getOlderBars = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(z.object({ pool: PoolAddress, tf: z.enum(TF_IDS), before: z.number().int().positive() }))
  .handler(({ data }) => loadOlder(data));

export const getTraders = createServerFn({ method: "GET" })
  .middleware([requireViewer])
  .validator(z.object({ pool: PoolAddress }))
  .handler(({ data }) => loadTraders(data.pool));
