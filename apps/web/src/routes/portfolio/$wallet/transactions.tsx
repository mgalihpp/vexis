import { createFileRoute } from "@tanstack/react-router";
import { Transactions, type TransactionsResult } from "@/features/portfolio/components/transactions";
import { getTransactions } from "@/features/portfolio/portfolio.functions";
import { usePortfolioView } from "@/features/portfolio/use-portfolio-view";

export const Route = createFileRoute("/portfolio/$wallet/transactions")({
  // One request per position makes a first load slow, so the promise is deferred and the tab opens at once.
  loader: ({ params }) => ({
    transactions: getTransactions({ data: { wallet: params.wallet } }).then(
      (histories): TransactionsResult => ({ ok: true, histories }),
      (e: unknown): TransactionsResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) }),
    ),
  }),
  component: TransactionsTab,
});

// Like the position tabs, this one hides the date range and pair filter; it filters by pool name.
function TransactionsTab() {
  const { transactions } = Route.useLoaderData();
  const { portfolio, currency } = usePortfolioView();
  return <Transactions result={transactions} portfolio={portfolio} currency={currency} />;
}
