import { queryOptions } from "@tanstack/react-query";
import type { OfficeAgent } from "@vexis/shared/office";
import { trpc } from "@/trpc/client";
import { pollMs } from "./office";

// Everything under ["office"] is invalidated together after any write.
export const OFFICE_KEY = ["office"] as const;

export const officeQuery = queryOptions({
  queryKey: [...OFFICE_KEY, "floor"],
  queryFn: () => trpc.office.get.query(),
  refetchInterval: (q) => pollMs(q.state.data),
});

/** Whether the viewer has an office at all; the screener asks before offering the hand-off. */
export const officeEnabledQuery = queryOptions({
  queryKey: [...OFFICE_KEY, "enabled"],
  queryFn: () => trpc.office.enabled.query(),
  staleTime: 5 * 60_000,
  refetchInterval: false,
});

export type FeedFilter = { agent?: OfficeAgent; pool?: string };

export const officeFeedQuery = (filter: FeedFilter) =>
  queryOptions({
    queryKey: [...OFFICE_KEY, "feed", filter.agent ?? null, filter.pool ?? null],
    queryFn: () => trpc.office.feed.query(filter),
  });
