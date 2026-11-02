import { queryOptions } from "@tanstack/react-query";
import { isNetworkError, LIVE_MS } from "@/lib/query";
import type { BalancesResult } from "./components/balances";
import { getBalances, getPortfolio, getPrices, getTransactions } from "./portfolio.functions";

// While a background job fills the cache in, poll fast enough for the progress notice to move.
const POLL_MS = 2000;

export const pricesQuery = queryOptions({ queryKey: ["prices"], queryFn: () => getPrices() });

export const portfolioQuery = (wallet: string) =>
  queryOptions({
    queryKey: ["portfolio", wallet],
    queryFn: () => getPortfolio({ data: { wallet } }),
    refetchInterval: (q) => (q.state.data?.closedProgress.running ? POLL_MS : LIVE_MS),
  });

export const transactionsQuery = (wallet: string) =>
  queryOptions({
    queryKey: ["transactions", wallet],
    queryFn: () => getTransactions({ data: { wallet } }),
    refetchInterval: (q) => (q.state.data?.progress.running ? POLL_MS : LIVE_MS),
  });

// Settles a server failure into the result so it shows inside the table. A network failure still rejects, so
// Query retries it.
export const balancesQuery = (wallet: string) =>
  queryOptions({
    queryKey: ["balances", wallet],
    queryFn: (): Promise<BalancesResult> =>
      getBalances({ data: { wallet } }).then(
        (balances) => ({ ok: true, balances }),
        (e: unknown) => {
          if (isNetworkError(e)) throw e;
          return { ok: false, message: e instanceof Error ? e.message : String(e) };
        },
      ),
  });
