import { createFileRoute } from "@tanstack/react-router";
import { Transactions } from "@/features/portfolio/components/transactions";
import { getTransactions } from "@/features/portfolio/portfolio.functions";
import { usePollWhile } from "@/features/portfolio/use-poll-while";
import { usePortfolioView } from "@/features/portfolio/use-portfolio-view";

export const Route = createFileRoute("/portfolio/$wallet/transactions")({
  loader: ({ params }) => getTransactions({ data: { wallet: params.wallet } }),
  component: TransactionsTab,
});

// Like the position tabs, this one hides the date range and pair filter; it filters by pool name.
function TransactionsTab() {
  const transactions = Route.useLoaderData();
  const { portfolio, currency } = usePortfolioView();
  usePollWhile(transactions.progress.running);
  return <Transactions transactions={transactions} portfolio={portfolio} currency={currency} />;
}
