import { createFileRoute, Link, notFound, Outlet, stripSearchParams, useMatchRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { CurrencyToggle } from "@/features/portfolio/components/currency-toggle";
import { Notice } from "@/features/portfolio/components/notice";
import { PairFilter, RangePicker } from "@/features/portfolio/components/range-picker";
import { WalletBar } from "@/features/portfolio/components/wallet-bar";
import { RANGE_PRESETS, type RangePreset } from "@/features/portfolio/portfolio";
import { getPortfolio, WalletAddress } from "@/features/portfolio/portfolio.functions";
import { usePollWhile } from "@/features/portfolio/use-poll-while";
import { useWallets } from "@/stores/wallets";

const RANGE_IDS = RANGE_PRESETS.map((p) => p.id) as [RangePreset, ...RangePreset[]];
const IsoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const defaults = { currency: "sol", range: "all" } as const;

// Every child tab reads these, so filters survive switching tabs.
const PortfolioSearch = z.object({
  currency: z.enum(["sol", "usd"]).default(defaults.currency).catch(defaults.currency),
  range: z.enum(RANGE_IDS).default(defaults.range).catch(defaults.range),
  from: IsoDay.optional().catch(undefined),
  to: IsoDay.optional().catch(undefined),
  pairs: z.array(z.string()).optional().catch(undefined),
});

export const Route = createFileRoute("/portfolio/$wallet")({
  validateSearch: PortfolioSearch,
  search: { middlewares: [stripSearchParams(defaults)] },
  loader: ({ params }) => {
    if (!WalletAddress.safeParse(params.wallet).success) throw notFound();
    return getPortfolio({ data: { wallet: params.wallet } });
  },
  head: ({ params }) => ({
    meta: [{ title: `${params.wallet.slice(0, 4)}…${params.wallet.slice(-4)} · Portfolio · Vexis` }],
  }),
  pendingComponent: PortfolioSkeleton,
  component: PortfolioLayout,
});

const TABS = [
  { to: "/portfolio/$wallet", label: "Overview", exact: true },
  { to: "/portfolio/$wallet/active", label: "Active Positions", exact: false },
  { to: "/portfolio/$wallet/closed", label: "Closed Positions", exact: false },
  { to: "/portfolio/$wallet/transactions", label: "Transactions", exact: false },
  { to: "/portfolio/$wallet/balances", label: "Balances", exact: false },
] as const;

const tabClass =
  "relative px-3 py-2 text-xs font-medium text-muted-foreground/70 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5";

function PortfolioLayout() {
  const { wallet } = Route.useParams();
  const portfolio = Route.useLoaderData();
  const visit = useWallets((s) => s.visit);
  useEffect(() => visit(wallet), [visit, wallet]);
  const pairs = [...new Set([...portfolio.closed, ...portfolio.active].map((p) => p.pair))].sort();
  const matchRoute = useMatchRoute();
  // The tables carry their own toolbar (currency toggle and pool filter) and ignore the date range.
  const onActive = Boolean(matchRoute({ to: "/portfolio/$wallet/active", params: { wallet } }));
  const onClosed = Boolean(matchRoute({ to: "/portfolio/$wallet/closed", params: { wallet } }));
  const onTransactions = Boolean(matchRoute({ to: "/portfolio/$wallet/transactions", params: { wallet } }));
  const onBalances = Boolean(matchRoute({ to: "/portfolio/$wallet/balances", params: { wallet } }));
  const ownToolbar = onActive || onClosed || onTransactions || onBalances;
  const pagedTable = onClosed || onTransactions;
  const { loaded, total, running } = portfolio.closedProgress;
  usePollWhile(running);

  return (
    <div className="flex h-full flex-col">
      <WalletBar wallet={wallet} />
      <nav className="flex shrink-0 overflow-x-auto border-b px-2">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ wallet }}
            search={(prev) => prev}
            activeOptions={{ exact: tab.exact, includeSearch: false }}
            className={`${tabClass} hover:text-muted-foreground`}
            activeProps={{ className: "text-foreground! after:bg-brand" }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {!ownToolbar && (
          <div className="flex items-center justify-between gap-2.5 px-2 pt-1.5 pb-0.5">
            <CurrencyToggle />
            <div className="flex items-center gap-1.5">
              <PairFilter pairs={pairs} />
              <RangePicker now={portfolio.fetchedAt} />
            </div>
          </div>
        )}
        <div className={`flex flex-1 flex-col px-2 ${ownToolbar ? "pt-2" : ""} ${pagedTable ? "" : "pb-3.25"}`}>
          {running ? (
            <Notice>
              Loading closed positions: {loaded} of {total} pools. Totals are partial until this finishes.
            </Notice>
          ) : (
            loaded < total && (
              <Notice>
                {total - loaded} {total - loaded === 1 ? "pool" : "pools"} failed to load and will retry on the next
                refresh.
              </Notice>
            )
          )}
          {!running && !onActive && !onBalances && portfolio.closed.length < portfolio.allTime.closedPositions && (
            <Notice>
              Showing {portfolio.closed.length} of the {portfolio.allTime.closedPositions} closed positions Meteora
              reports for this wallet. Its portfolio API only lists pools with a position closed in the last 365 days.
            </Notice>
          )}
          <Outlet />
        </div>
      </div>
    </div>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="space-y-2 p-2">
      <div className="h-11.25 animate-pulse rounded-md bg-card" />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[7.5rem] animate-pulse rounded-lg bg-card" />
        ))}
      </div>
      <div className="grid gap-2 xl:grid-cols-[1fr_2fr]">
        <div className="h-[29.5rem] animate-pulse rounded-lg bg-card" />
        <div className="h-[29.5rem] animate-pulse rounded-lg bg-card" />
      </div>
      <p className="text-center text-xs text-muted-foreground">Loading positions from Meteora…</p>
    </div>
  );
}
