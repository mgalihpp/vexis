import { notFound, redirect } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { createTRPCClient, httpBatchLink, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";
import { serverLink } from "./local-link.server";
import type { AppRouter } from "./router.server";

/**
 * The server answers a signed-out caller with UNAUTHORIZED and a non-admin with NOT_FOUND. Router loaders and
 * boundaries understand `redirect` and `notFound`, so the link turns the codes back into those, as the old server
 * function middleware threw them directly.
 */
const routerErrors: TRPCLink<AppRouter> = () => {
  return ({ op, next }) =>
    observable((observer) =>
      next(op).subscribe({
        next: (value) => observer.next(value),
        complete: () => observer.complete(),
        error: (error) => {
          const code = error.data?.code;
          if (code === "UNAUTHORIZED") observer.error(redirect({ to: "/login" }) as never);
          else if (code === "NOT_FOUND" && op.path.startsWith("admin.")) observer.error(notFound() as never);
          else observer.error(error);
        },
      }),
    );
};

const transport = createIsomorphicFn()
  .server(() => serverLink)
  .client(() => httpBatchLink({ url: "/api/trpc", transformer: superjson }));

/** One client for the whole app: it holds no per-request state, the context is read from the request being served. */
export const trpc = createTRPCClient<AppRouter>({ links: [routerErrors, transport()] });
