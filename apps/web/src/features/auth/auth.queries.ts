import { queryOptions } from "@tanstack/react-query";
import { trpc } from "@/trpc/client";

/** Read by the root guard on every navigation, so it is cached; sign-in and sign-out reset it. */
export const viewerQuery = queryOptions({
  queryKey: ["viewer"],
  queryFn: () => trpc.auth.viewer.query(),
  staleTime: 5 * 60_000,
  refetchInterval: false,
});
