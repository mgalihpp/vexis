import { queryOptions } from "@tanstack/react-query";
import { LIVE_MS } from "@/lib/query";
import { getAgents, getAlerts, getRebalances, getRebalanceWallet, getTelegram } from "./agents.functions";

// Everything under ["agents"] is invalidated together after any write.
export const AGENTS_KEY = ["agents"] as const;

export const agentsQuery = queryOptions({ queryKey: [...AGENTS_KEY, "list"], queryFn: () => getAgents() });

export const alertsQuery = queryOptions({ queryKey: [...AGENTS_KEY, "alerts"], queryFn: () => getAlerts() });

export const rebalancesQuery = queryOptions({
  queryKey: [...AGENTS_KEY, "rebalances"],
  queryFn: () => getRebalances(),
});

export const walletQuery = queryOptions({ queryKey: [...AGENTS_KEY, "wallet"], queryFn: () => getRebalanceWallet() });

// While the user's bot waits for their /start, check often so the page flips to "linked".
const LINK_POLL_MS = 3000;

export const telegramQuery = queryOptions({
  queryKey: [...AGENTS_KEY, "telegram"],
  queryFn: () => getTelegram(),
  refetchInterval: (q) => (q.state.data?.bot && !q.state.data.bot.linked ? LINK_POLL_MS : LIVE_MS),
});
