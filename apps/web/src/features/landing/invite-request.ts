import { z } from "zod";

export const InviteRequestInput = z.object({
  email: z.email().trim().toLowerCase(),
  website: z.string().optional(),
});

export type InviteRequestError = "rate-limited" | "server";

export type InviteRequestResult = { ok: true } | { ok: false; error: InviteRequestError };

export const INVITE_REQUEST_ERROR_MESSAGE: Record<InviteRequestError | "network", string> = {
  "rate-limited": "Too many requests from your network. Try again in an hour.",
  server: "Something went wrong. Try again.",
  network: "Can’t reach the server. Try again.",
};

export const INVITE_REQUEST_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

/** Sliding window: `times` are one client's earlier request times; returns the times to keep. */
export function rateLimit(times: readonly number[], now: number, limit = INVITE_REQUEST_LIMIT) {
  const recent = times.filter((t) => now - t < limit.windowMs);
  if (recent.length >= limit.max) return { ok: false, times: recent };
  return { ok: true, times: [...recent, now] };
}
