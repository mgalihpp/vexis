import { createFileRoute } from "@tanstack/react-router";
import { ClosedPositions } from "@/features/portfolio/components/closed-positions";
import { usePortfolioView } from "@/features/portfolio/use-portfolio-view";

export const Route = createFileRoute("/portfolio/$wallet/closed")({
  component: ClosedTab,
});

// Like the active tab, this one hides the date range and pair filter, so neither narrows it; it filters by pool name.
function ClosedTab() {
  const { portfolio, currency } = usePortfolioView();
  return <ClosedPositions closed={portfolio.closed} pools={portfolio.closedPools} currency={currency} />;
}
