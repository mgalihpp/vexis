import { QueryClient } from "@tanstack/react-query";

// Bots write files and Meteora updates on their own schedule; refetching visible queries is the whole
// live-update mechanism. Query pauses it while the tab is hidden.
export const LIVE_MS = 15_000;

const MAX_RETRIES = 3;

// fetch rejects with a TypeError when no response arrives at all, as when the VPS's provider NAT drops a new
// connection. A fresh connection usually gets through, and every server function is a GET, so those are safe to
// retry. Anything else came back from the server and would fail again.
export function isNetworkError(error: unknown) {
  return error instanceof TypeError;
}

/** One per router: on the server that means one per request, so readers never share a cache. */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Long enough that hydration doesn't refetch what SSR just sent.
        staleTime: 10_000,
        refetchInterval: LIVE_MS,
        retry: (count, error) => typeof window !== "undefined" && isNetworkError(error) && count < MAX_RETRIES,
      },
    },
  });
}
