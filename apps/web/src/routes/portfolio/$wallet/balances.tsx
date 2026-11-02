import { createFileRoute } from "@tanstack/react-router";
import { Balances } from "@/features/portfolio/components/balances";
import { balancesQuery } from "@/features/portfolio/portfolio.queries";
import { usePortfolioView } from "@/features/portfolio/use-portfolio-view";

export const Route = createFileRoute("/portfolio/$wallet/balances")({
  // A wallet with thousands of tokens needs one token search per hundred, so the tab opens before they finish
  // and the result streams in.
  loader: ({ params, context }) => {
    void context.queryClient.prefetchQuery(balancesQuery(params.wallet));
  },
  component: BalancesTab,
});

function BalancesTab() {
  const { wallet } = Route.useParams();
  const { portfolio, currency } = usePortfolioView();
  return <Balances wallet={wallet} solPrice={portfolio.solPrice} currency={currency} />;
}
