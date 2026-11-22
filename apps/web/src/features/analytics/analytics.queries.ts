import { queryOptions } from "@tanstack/react-query";
import { trpc } from "@/trpc/client";
import type { TimeframeId } from "./analytics";

export const analyticsQuery = (input: { pool?: string | undefined }) =>
  queryOptions({
    queryKey: ["analytics", input.pool ?? null],
    queryFn: () => trpc.analytics.get.query(input),
  });

/** Positions change slowly and each scan costs RPC and rate-limit budget, so this query does not poll. */
export const trackedQuery = (input: {
  pool: string;
  page?: number;
  pageSize?: 10 | 25 | 50;
  query?: string;
  range?: ("in" | "out")[];
  pnl?: ("profit" | "loss")[];
  sort?: "recent" | "liquidity";
}) => {
  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 10;
  const query = (input.query ?? "").trim();
  const range = [...(input.range ?? [])].sort();
  const pnl = [...(input.pnl ?? [])].sort();
  const sort = input.sort ?? "recent";
  return queryOptions({
    queryKey: ["analytics", "tracked", input.pool, page, pageSize, query, range, pnl, sort],
    queryFn: () => trpc.analytics.tracked.query({ pool: input.pool, page, pageSize, query, range, pnl, sort }),
    staleTime: 5 * 60_000,
    // Poll while the pool-wide totals are still loading.
    refetchInterval: (q) => (q.state.data?.ok && q.state.data.totals.running ? 2000 : false),
  });
};

/** One position's bins, read on chain when its row is opened; the server caches them 15 s, so this does not poll. */
export const trackedBinsQuery = (pool: string, position: string) =>
  queryOptions({
    queryKey: ["analytics", "tracked-bins", pool, position],
    queryFn: () => trpc.analytics.trackedBins.query({ pool, position }),
    staleTime: 15_000,
  });

const TRADERS_MS = 60_000;

/** Polls at the server's recent trades cache pace; the Solana Tracker lists behind it are cached a day. */
export const tradersQuery = (pool: string) =>
  queryOptions({
    queryKey: ["analytics", "traders", pool],
    queryFn: () => trpc.analytics.traders.query({ pool }),
    staleTime: TRADERS_MS,
    refetchInterval: TRADERS_MS,
  });

export const chartQuery = (input: { pool: string; tf: TimeframeId }) =>
  queryOptions({
    queryKey: ["analytics", "chart", input.pool, input.tf],
    queryFn: () => trpc.analytics.chart.query(input),
  });
