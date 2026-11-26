import { queryOptions } from "@tanstack/react-query";
import { trpc } from "@/trpc/client";

/** Read by the root guard on every navigation, so it is cached; sign-in and sign-out reset it. */
export const viewerQuery = queryOptions({
  queryKey: ["viewer"],
  queryFn: () => trpc.auth.viewer.query(),
  staleTime: 5 * 60_000,
  refetchInterval: false,
});

/** The Turnstile site key, read at runtime so it needs no build variable; null means Turnstile is off. */
export const captchaQuery = queryOptions({
  queryKey: ["captcha"],
  queryFn: () => trpc.auth.captcha.query(),
  staleTime: Number.POSITIVE_INFINITY,
  refetchInterval: false,
});
