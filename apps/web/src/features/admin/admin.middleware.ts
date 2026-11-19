import { TRPCError } from "@trpc/server";
import { roleOf } from "@vexis/db/admin-queries";
import { getDb } from "@vexis/db/client";
import { isAdminRole, type Limit, originAllowed, slide } from "@vexis/shared/admin";
import { getFreshViewerFromHeaders } from "@/features/auth/auth.server";
import { publicProcedure } from "@/trpc/init.server";

/**
 * Every admin procedure passes through this. Route guards only steer the UI; the endpoint is open to anyone. The
 * session is read without the cookie cache and the role comes from the database, so a demoted admin or a revoked
 * session loses access on the next call. A non-admin gets the same 404 a missing page would, never a hint that the
 * endpoint exists.
 */
export const adminProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const viewer = await getFreshViewerFromHeaders(ctx.headers);
  if (!viewer) throw new TRPCError({ code: "UNAUTHORIZED" });
  if (!isAdminRole(await roleOf(getDb(), viewer.id))) throw new TRPCError({ code: "NOT_FOUND" });
  return next({ ctx: { admin: { id: viewer.id, email: viewer.email } } });
});

const WRITE: Limit = { max: 60, windowMs: 60_000 };
const hits = new Map<string, number[]>();

/** A sliding-window limit per admin and bucket, in memory like the invite-request limiter. True when refused. */
export function limited(key: string, limit: Limit) {
  const now = Date.now();
  if (hits.size > 1000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= 3_600_000)) hits.delete(k);
  }
  const result = slide(hits.get(key) ?? [], now, limit);
  hits.set(key, result.times);
  return !result.ok;
}

/** Writes: an admin, from our own origin, within the rate limit. */
export const adminWriteProcedure = adminProcedure.use(({ ctx, next }) => {
  const configured = process.env.BETTER_AUTH_URL;
  const ok = originAllowed({
    origin: ctx.headers.get("origin"),
    secFetchSite: ctx.headers.get("sec-fetch-site"),
    expectedOrigin: configured ? new URL(configured).origin : ctx.url.origin,
  });
  if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "Request refused" });
  if (limited(`write:${ctx.admin.id}`, WRITE)) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many requests. Try again in a minute." });
  }
  return next();
});
