import { queryOptions } from "@tanstack/react-query";
import { LIVE_MS } from "@/lib/query";
import { trpc } from "@/trpc/client";

// Everything under ["agents"] is invalidated together after any write.
export const AGENTS_KEY = ["agents"] as const;

export const agentsQuery = queryOptions({ queryKey: [...AGENTS_KEY, "list"], queryFn: () => trpc.agents.list.query() });

export const alertsQuery = queryOptions({
  queryKey: [...AGENTS_KEY, "alerts"],
  queryFn: () => trpc.agents.alerts.query(),
});

export const rebalancesQuery = (agentId: string) =>
  queryOptions({
    queryKey: [...AGENTS_KEY, "rebalances", agentId],
    queryFn: () => trpc.agents.rebalances.query({ agentId }),
  });

export const walletQuery = queryOptions({
  queryKey: [...AGENTS_KEY, "wallet"],
  queryFn: () => trpc.agents.wallet.get.query(),
});

// While the user's bot waits for their /start, check often so the page flips to "linked".
const LINK_POLL_MS = 3000;

export const telegramQuery = queryOptions({
  queryKey: [...AGENTS_KEY, "telegram"],
  queryFn: () => trpc.agents.telegram.get.query(),
  refetchInterval: (q) =>
    Object.values(q.state.data ?? {}).some((tg) => tg.bot && !tg.bot.linked) ? LINK_POLL_MS : LIVE_MS,
});
