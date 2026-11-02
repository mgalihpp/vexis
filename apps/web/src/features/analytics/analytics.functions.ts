import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { TIMEFRAMES, type TimeframeId } from "./analytics";
import { loadAnalytics, loadChart, loadOlder, searchPools } from "./analytics.server";

const TF_IDS = TIMEFRAMES.map((t) => t.id) as [TimeframeId, ...TimeframeId[]];
export const PoolAddress = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Not a Solana address");

export const getAnalytics = createServerFn({ method: "GET" })
  .validator(z.object({ pool: PoolAddress.optional() }))
  .handler(({ data }) => loadAnalytics(data));

export const getChart = createServerFn({ method: "GET" })
  .validator(z.object({ pool: PoolAddress, tf: z.enum(TF_IDS) }))
  .handler(({ data }) => loadChart(data));

export const findPools = createServerFn({ method: "GET" })
  .validator(z.object({ query: z.string().trim().min(1).max(40) }))
  .handler(({ data }) => searchPools(data.query));

export const getOlderBars = createServerFn({ method: "GET" })
  .validator(z.object({ pool: PoolAddress, tf: z.enum(TF_IDS), before: z.number().int().positive() }))
  .handler(({ data }) => loadOlder(data));
