import { queryOptions } from "@tanstack/react-query";
import { getViewer } from "./auth.functions";

/** Read by the root guard on every navigation, so it is cached; sign-in and sign-out reset it. */
export const viewerQuery = queryOptions({
  queryKey: ["viewer"],
  queryFn: () => getViewer(),
  staleTime: 5 * 60_000,
  refetchInterval: false,
});
