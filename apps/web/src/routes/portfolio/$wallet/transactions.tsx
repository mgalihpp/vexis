import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Transactions } from "@/features/portfolio/components/transactions";
import { transactionsQuery } from "@/features/portfolio/portfolio.queries";
import { usePortfolioView } from "@/features/portfolio/use-portfolio-view";

export const Route = createFileRoute("/portfolio/$wallet/transactions")({
  loader: async ({ params, context }) => {
    await context.queryClient.ensureQueryData(transactionsQuery(params.wallet));
  },
  component: TransactionsTab,
});

// Like the position tabs, this one hides the date range and pair filter; it filters by pool name.
function TransactionsTab() {
  const { wallet } = Route.useParams();
  const { data: transactions } = useSuspenseQuery(transactionsQuery(wallet));
  const { portfolio, currency } = usePortfolioView();
  return <Transactions transactions={transactions} portfolio={portfolio} currency={currency} />;
}
