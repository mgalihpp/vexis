import { queryOptions } from "@tanstack/react-query";
import type { OfficeAgent } from "@vexis/db/office";
import { pollMs } from "./office";
import { getOffice, getOfficeFeed } from "./office.functions";

// Everything under ["office"] is invalidated together after any write.
export const OFFICE_KEY = ["office"] as const;

export const officeQuery = queryOptions({
  queryKey: [...OFFICE_KEY, "floor"],
  queryFn: () => getOffice(),
  refetchInterval: (q) => pollMs(q.state.data),
});

export type FeedFilter = { agent?: OfficeAgent; pool?: string };

export const officeFeedQuery = (filter: FeedFilter) =>
  queryOptions({
    queryKey: [...OFFICE_KEY, "feed", filter.agent ?? null, filter.pool ?? null],
    queryFn: () => getOfficeFeed({ data: filter }),
  });
