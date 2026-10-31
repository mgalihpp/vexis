import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { PnlCalendar } from "@/features/portfolio/components/pnl-calendar";
import { CumulativeChart, PeriodChart } from "@/features/portfolio/components/pnl-charts";
import { StatCards } from "@/features/portfolio/components/stat-cards";
import { ActiveSummary, Performance } from "@/features/portfolio/components/summary-panels";
import { summarize } from "@/features/portfolio/portfolio";
import { usePortfolioView } from "@/features/portfolio/use-portfolio-view";

export const Route = createFileRoute("/portfolio/$wallet/")({
  component: Overview,
});

function Overview() {
  const { portfolio, closed, active, currency } = usePortfolioView();
  const stats = useMemo(() => summarize(closed, currency), [closed, currency]);

  return (
    <div className="space-y-2.5">
      <StatCards stats={stats} currency={currency} />
      <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-2.5">
          <ActiveSummary active={active} currency={currency} />
          <Performance stats={stats} active={active} currency={currency} />
        </div>
        <PnlCalendar closed={closed} currency={currency} now={portfolio.fetchedAt} />
      </div>
      <div className="grid gap-2.5 xl:grid-cols-2">
        <CumulativeChart closed={closed} currency={currency} />
        <PeriodChart closed={closed} currency={currency} />
      </div>
    </div>
  );
}
