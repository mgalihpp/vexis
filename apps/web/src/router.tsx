import { createRouter, type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { useEffect } from "react";
import { createQueryClient, isNetworkError } from "@/lib/query";
import { routeTree } from "./routeTree.gen";

const RECONNECT_MS = 5000;

// Query has already retried a network failure by the time it lands here, and a failed background refetch keeps
// the old data on screen instead, so this only shows when a page has nothing to fall back on.
function ErrorPanel({ error }: ErrorComponentProps) {
  const router = useRouter();
  const network = isNetworkError(error);

  useEffect(() => {
    if (!network) return;
    const id = setInterval(() => router.invalidate(), RECONNECT_MS);
    return () => clearInterval(id);
  }, [network, router]);

  if (network) {
    return (
      <div className="panel border-amber-500/40 p-4.75">
        <p className="font-medium text-amber-300">Can't reach the server. Reconnecting…</p>
        <p className="mt-2.5 text-xs text-muted-foreground">
          The page reloads by itself once the connection is back.{" "}
          <button type="button" className="text-brand hover:underline" onClick={() => router.invalidate()}>
            Retry now
          </button>
        </p>
      </div>
    );
  }

  return (
    <div className="panel border-rose-500/40 p-4.75">
      <p className="font-medium text-rose-300">Something broke while loading this page.</p>
      <pre className="mt-2.5 whitespace-pre-wrap text-xs text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </pre>
    </div>
  );
}

export function getRouter() {
  const queryClient = createQueryClient();
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Query decides whether a preload needs to fetch.
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: ErrorPanel,
    defaultNotFoundComponent: () => (
      <div className="panel p-4.75">
        <p className="font-medium">Nothing here.</p>
        <Link to="/" className="mt-1.5 inline-block text-xs text-brand hover:underline">
          Back to the fleet
        </Link>
      </div>
    ),
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}
