import { getRequestHeaders, getRequestIP, getRequestUrl } from "@tanstack/react-start/server";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { getViewerFromHeaders } from "@/features/auth/auth.server";

/**
 * Built per call from the request Start is serving, so the same context works for the HTTP handler and for the
 * in-process calls SSR makes.
 */
export async function createContext() {
  return {
    headers: new Headers(getRequestHeaders()),
    url: getRequestUrl(),
    ip: getRequestIP({ xForwardedFor: true }) ?? "unknown",
  };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

/**
 * Every procedure that reads app data goes through this. Route guards only steer the UI; the HTTP endpoint is open
 * to anyone, so this is the check that actually keeps signed-out callers out.
 */
export const viewerProcedure = t.procedure.use(async ({ ctx, next }) => {
  const viewer = await getViewerFromHeaders(ctx.headers);
  if (!viewer) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { viewer } });
});
