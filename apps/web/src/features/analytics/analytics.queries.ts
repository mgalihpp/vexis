import { queryOptions } from "@tanstack/react-query";
import type { TimeframeId } from "./analytics";
import { getAnalytics } from "./analytics.functions";

export const analyticsQuery = (input: { pool?: string; tf: TimeframeId }) =>
  queryOptions({
    queryKey: ["analytics", input.pool ?? null, input.tf],
    queryFn: () => getAnalytics({ data: input }),
  });
