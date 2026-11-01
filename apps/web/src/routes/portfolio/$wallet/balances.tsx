import { createFileRoute } from "@tanstack/react-router";
import { Balances, type BalancesResult } from "@/features/portfolio/components/balances";
import { getBalances } from "@/features/portfolio/portfolio.functions";
import { usePortfolioView } from "@/features/portfolio/use-portfolio-view";

export const Route = createFileRoute("/portfolio/$wallet/balances")({
  // A wallet with thousands of tokens needs one token search per hundred, so the tab opens before they finish.
  loader: ({ params }) => ({
    balances: getBalances({ data: { wallet: params.wallet } }).then(
      (balances): BalancesResult => ({ ok: true, balances }),
      (e: unknown): BalancesResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) }),
    ),
  }),
  component: BalancesTab,
});

function BalancesTab() {
  const { balances } = Route.useLoaderData();
  const { portfolio, currency } = usePortfolioView();
  return <Balances result={balances} solPrice={portfolio.solPrice} currency={currency} />;
}
