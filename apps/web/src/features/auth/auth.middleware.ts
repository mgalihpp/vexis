import { redirect } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getViewerFromHeaders } from "./auth.server";

/**
 * Put on every server function that reads app data. Route guards only steer the UI; server functions are
 * endpoints anyone can call, so this is the check that actually keeps signed-out callers out.
 */
export const requireViewer = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const viewer = await getViewerFromHeaders(new Headers(getRequestHeaders()));
  if (!viewer) throw redirect({ to: "/login" });
  return next({ context: { viewer } });
});
