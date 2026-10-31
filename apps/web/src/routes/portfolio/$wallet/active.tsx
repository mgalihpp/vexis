import { createFileRoute } from "@tanstack/react-router";
import { ActivePositions } from "@/features/portfolio/components/active-positions";
import { usePortfolioView } from "@/features/portfolio/use-portfolio-view";

export const Route = createFileRoute("/portfolio/$wallet/active")({
  component: ActiveTab,
});

// The pair filter is hidden on this tab, so it must not narrow the pools either; the tab filters by pool name.
function ActiveTab() {
  const { portfolio, currency } = usePortfolioView();
  return <ActivePositions pools={portfolio.active} currency={currency} />;
}
