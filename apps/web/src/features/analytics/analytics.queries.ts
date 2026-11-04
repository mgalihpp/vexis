import { queryOptions } from "@tanstack/react-query";
import type { TimeframeId } from "./analytics";
import { getAnalytics, getChart, getTrackedPositions } from "./analytics.functions";

export const analyticsQuery = (input: { pool?: string | undefined }) =>
  queryOptions({
    queryKey: ["analytics", input.pool ?? null],
    queryFn: () => getAnalytics({ data: input }),
  });

/** Positions change slowly and each scan costs RPC and rate-limit budget, so this query does not poll. */
export const trackedQuery = (input: { pool: string; page?: number; pageSize?: 10 | 25 | 50 }) => {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 10;
  return queryOptions({
    queryKey: ["analytics", "tracked", input.pool, page, pageSize],
    queryFn: () => getTrackedPositions({ data: { pool: input.pool, page, pageSize } }),
    staleTime: 5 * 60_000,
    refetchInterval: false,
  });
};

export const chartQuery = (input: { pool: string; tf: TimeframeId }) =>
  queryOptions({
    queryKey: ["analytics", "chart", input.pool, input.tf],
    queryFn: () => getChart({ data: input }),
  });
