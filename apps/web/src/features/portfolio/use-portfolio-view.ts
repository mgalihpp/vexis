import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTzOffset } from "@/features/timezone/timezone";
import { rangeFromSearch } from "./components/range-picker";
import { inRange } from "./portfolio";
import { portfolioQuery } from "./portfolio.queries";

const route = getRouteApi("/portfolio/$wallet");

/** The wallet in the URL's portfolio, which the layout's loader put in the cache. */
export function usePortfolio() {
  const { wallet } = route.useParams();
  return useSuspenseQuery(portfolioQuery(wallet)).data;
}

/** The loaded portfolio narrowed by the date range and pair filter in the URL. */
export function usePortfolioView() {
  const portfolio = usePortfolio();
  const search = route.useSearch();
  const offset = useTzOffset();
  const { from, to } = rangeFromSearch(search, portfolio.fetchedAt, offset);
  const pairKey = search.pairs?.join(",") ?? "";

  const { closed, active } = useMemo(() => {
    const pairs = pairKey ? new Set(pairKey.split(",")) : null;
    const keep = (p: { pair: string }) => !pairs || pairs.has(p.pair);
    return {
      closed: inRange(portfolio.closed, { from, to }, offset).filter(keep),
      active: portfolio.active.filter(keep),
    };
  }, [portfolio, from, to, offset, pairKey]);

  return { portfolio, closed, active, currency: search.currency };
}
