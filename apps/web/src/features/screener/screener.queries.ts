import { queryOptions } from "@tanstack/react-query";
import { trpc } from "@/trpc/client";

const SCREENER_MS = 60_000;

/** Polls at the server cache's pace; a faster poll would only download the same list again. */
export const screenerQuery = queryOptions({
  queryKey: ["screener"],
  queryFn: () => trpc.screener.list.query(),
  staleTime: SCREENER_MS,
  refetchInterval: SCREENER_MS,
});
