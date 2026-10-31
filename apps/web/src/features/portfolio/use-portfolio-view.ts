import { getRouteApi } from "@tanstack/react-router";
import { useMemo } from "react";
import { rangeFromSearch } from "./components/range-picker";
import { inRange } from "./portfolio";

const route = getRouteApi("/portfolio/$wallet");

/** The loaded portfolio narrowed by the date range and pair filter in the URL. */
export function usePortfolioView() {
  const portfolio = route.useLoaderData();
  const search = route.useSearch();
  const { from, to } = rangeFromSearch(search, portfolio.fetchedAt);
  const pairKey = search.pairs?.join(",") ?? "";

  const { closed, active } = useMemo(() => {
    const pairs = pairKey ? new Set(pairKey.split(",")) : null;
    const keep = (p: { pair: string }) => !pairs || pairs.has(p.pair);
    return {
      closed: inRange(portfolio.closed, { from, to }).filter(keep),
      active: portfolio.active.filter(keep),
    };
  }, [portfolio, from, to, pairKey]);

  return { portfolio, closed, active, currency: search.currency };
}
