import { createRouter, type ErrorComponentProps, Link, useRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { RotateCwIcon, TriangleAlertIcon, WifiOffIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { createQueryClient, isNetworkError } from "@/lib/query";
import { routeTree } from "./routeTree.gen";

const RECONNECT_S = 5;

// Query has already retried a network failure by the time it lands here, and a failed background refetch keeps
// the old data on screen instead, so this only shows when a page has nothing to fall back on.
function ErrorPanel({ error }: ErrorComponentProps) {
  const router = useRouter();
  const network = isNetworkError(error);
  const [left, setLeft] = useState(RECONNECT_S);
  const [retrying, setRetrying] = useState(false);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      await router.invalidate();
    } finally {
      setRetrying(false);
      setLeft(RECONNECT_S);
    }
  }, [router]);

  useEffect(() => {
    if (!network || retrying) return;
    if (left <= 0) {
      void retry();
      return;
    }
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [network, retrying, left, retry]);

  if (network) {
    return (
      <ErrorState
        pulse
        icon={<WifiOffIcon />}
        title="Can't reach the server"
        description="Your data is safe. The page reloads by itself once the connection is back."
      >
        <div className="flex w-full max-w-64 flex-col gap-2">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-1000 ease-linear"
              style={{ width: retrying ? "100%" : `${((RECONNECT_S - left) / RECONNECT_S) * 100}%` }}
            />
          </div>
          <p className="text-[0.6875rem] text-muted-foreground" aria-live="polite">
            {retrying ? "Reconnecting…" : `Next attempt in ${left}s`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>
          <RotateCwIcon className={retrying ? "animate-spin" : undefined} />
          Retry now
        </Button>
      </ErrorState>
    );
  }

  return (
    <ErrorState
      icon={<TriangleAlertIcon />}
      title="Something broke while loading this page"
      description="Try again, and if it keeps happening, the details below will help track it down."
    >
      <pre className="scrollbar-thin max-h-40 w-full overflow-auto rounded-lg border bg-muted/40 p-3 text-left font-mono text-[0.6875rem] whitespace-pre-wrap text-muted-foreground">
        {error instanceof Error ? error.message : String(error)}
      </pre>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={retry} disabled={retrying}>
          <RotateCwIcon className={retrying ? "animate-spin" : undefined} />
          Try again
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </ErrorState>
  );
}

function ErrorState({
  pulse = false,
  icon,
  title,
  description,
  children,
}: {
  pulse?: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div
      className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center gap-5 px-4 text-center"
      role="alert"
    >
      <div className="relative">
        {pulse && <span className="absolute inset-0 rounded-xl bg-foreground/10 motion-safe:animate-ping" />}
        <div className="relative flex size-11 items-center justify-center rounded-xl border bg-muted text-foreground [&_svg]:size-5">
          {icon}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs/relaxed text-balance text-muted-foreground">{description}</p>
      </div>
      {children}
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
        <Link to="/portfolio" className="mt-1.5 inline-block text-xs text-brand hover:underline">
          Back to your portfolio
        </Link>
      </div>
    ),
  });
  setupRouterSsrQueryIntegration({ router, queryClient });
  return router;
}
