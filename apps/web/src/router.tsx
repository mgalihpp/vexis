import { createRouter, Link } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultErrorComponent: ({ error }) => (
      <div className="panel border-rose-500/40 p-6">
        <p className="font-medium text-rose-300">Something broke while loading this page.</p>
        <pre className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      </div>
    ),
    defaultNotFoundComponent: () => (
      <div className="panel p-6">
        <p className="font-medium">Nothing here.</p>
        <Link to="/" className="mt-2 inline-block text-sm text-brand hover:underline">
          Back to the fleet
        </Link>
      </div>
    ),
  });
}
