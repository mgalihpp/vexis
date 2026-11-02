import { queryOptions } from "@tanstack/react-query";
import type { TimeframeId } from "./analytics";
import { getAnalytics, getChart } from "./analytics.functions";

export const analyticsQuery = (input: { pool?: string | undefined }) =>
  queryOptions({
    queryKey: ["analytics", input.pool ?? null],
    queryFn: () => getAnalytics({ data: input }),
  });

export const chartQuery = (input: { pool: string; tf: TimeframeId }) =>
  queryOptions({
    queryKey: ["analytics", "chart", input.pool, input.tf],
    queryFn: () => getChart({ data: input }),
  });
