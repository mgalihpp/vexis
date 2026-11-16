import { queryOptions } from "@tanstack/react-query";
import { getHeartbeats } from "./admin.functions";

export const heartbeatsQuery = queryOptions({
  queryKey: ["admin", "heartbeats"],
  queryFn: () => getHeartbeats(),
});
