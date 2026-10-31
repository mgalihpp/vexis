import { createRouter, Link } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultErrorComponent: ({ error }) => (
      <div className="panel border-rose-500/40 p-4.75">
        <p className="font-medium text-rose-300">Something broke while loading this page.</p>
        <pre className="mt-2.5 whitespace-pre-wrap text-xs text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      </div>
    ),
    defaultNotFoundComponent: () => (
      <div className="panel p-4.75">
        <p className="font-medium">Nothing here.</p>
        <Link to="/" className="mt-1.5 inline-block text-xs text-brand hover:underline">
          Back to the fleet
        </Link>
      </div>
    ),
  });
}
