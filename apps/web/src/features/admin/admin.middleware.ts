import { notFound, redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders, getRequestUrl } from "@tanstack/react-start/server";
import { roleOf } from "@vexis/db/admin-queries";
import { getDb } from "@vexis/db/client";
import { isAdminRole, type Limit, originAllowed, slide } from "@vexis/shared/admin";
import { getFreshViewerFromHeaders } from "@/features/auth/auth.server";

/**
 * Every admin server function passes through this. Route guards only steer the UI; these functions are endpoints
 * anyone can call. The session is read without the cookie cache and the role comes from the database, so a
 * demoted admin or a revoked session loses access on the next call. A non-admin gets the same 404 a missing page
 * would, never a hint that the endpoint exists.
 */
export const requireAdmin = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const viewer = await getFreshViewerFromHeaders(new Headers(getRequestHeaders()));
  if (!viewer) throw redirect({ to: "/login" });
  if (!isAdminRole(await roleOf(getDb(), viewer.id))) throw notFound();
  return next({ context: { admin: { id: viewer.id, email: viewer.email } } });
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

function expectedOrigin() {
  const configured = process.env.BETTER_AUTH_URL;
  return configured ? new URL(configured).origin : getRequestUrl().origin;
}

/** Writes: an admin, from our own origin, within the rate limit. */
export const requireAdminWrite = createMiddleware({ type: "function" })
  .middleware([requireAdmin])
  .server(async ({ next, context }) => {
    const headers = new Headers(getRequestHeaders());
    const ok = originAllowed({
      origin: headers.get("origin"),
      secFetchSite: headers.get("sec-fetch-site"),
      expectedOrigin: expectedOrigin(),
    });
    if (!ok) throw new Error("Request refused");
    if (limited(`write:${context.admin.id}`, WRITE)) throw new Error("Too many requests. Try again in a minute.");
    return next();
  });
