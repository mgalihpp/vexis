import { createFileRoute, Link, notFound, Outlet, stripSearchParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { CurrencyToggle } from "@/features/portfolio/components/currency-toggle";
import { PairFilter, RangePicker } from "@/features/portfolio/components/range-picker";
import { WalletBar } from "@/features/portfolio/components/wallet-bar";
import { RANGE_PRESETS, type RangePreset } from "@/features/portfolio/portfolio";
import { getPortfolio, WalletAddress } from "@/features/portfolio/portfolio.functions";
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
] as const;

const tabClass =
  "relative -mb-px border-b-2 border-transparent px-3.5 py-2.5 text-[0.9375rem] font-medium text-foreground/70";

function PortfolioLayout() {
  const { wallet } = Route.useParams();
  const portfolio = Route.useLoaderData();
  const visit = useWallets((s) => s.visit);
  useEffect(() => visit(wallet), [visit, wallet]);
  const pairs = [...new Set([...portfolio.closed, ...portfolio.active].map((p) => p.pair))].sort();

  return (
    <div>
      <WalletBar wallet={wallet} />
      <nav className="flex overflow-x-auto border-b px-2.5">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            params={{ wallet }}
            search={(prev) => prev}
            activeOptions={{ exact: tab.exact, includeSearch: false }}
            className={`${tabClass} hover:text-foreground`}
            activeProps={{ className: "border-brand! text-foreground!" }}
          >
            {tab.label}
          </Link>
        ))}
        {["Transactions", "Balances"].map((label) => (
          <span key={label} title="Coming soon" className={`${tabClass} cursor-not-allowed text-foreground/40`}>
            {label}
          </span>
        ))}
      </nav>
      <div className="flex items-center justify-between gap-3 px-2.5 py-2.5">
        <CurrencyToggle />
        <div className="flex items-center gap-2">
          <PairFilter pairs={pairs} />
          <RangePicker now={portfolio.fetchedAt} />
        </div>
      </div>
      <div className="px-2.5 pb-4">
        {portfolio.closed.length < portfolio.allTime.closedPositions && (
          <p className="mb-2.5 rounded-md border border-brand/30 bg-brand/10 px-3 py-2 text-sm text-foreground/80">
            Showing {portfolio.closed.length} of the {portfolio.allTime.closedPositions} closed positions Meteora
            reports for this wallet. Its portfolio API only lists pools with a position closed in the last 365 days.
          </p>
        )}
        <Outlet />
      </div>
    </div>
  );
}

function PortfolioSkeleton() {
  return (
    <div className="space-y-2.5 p-2.5">
      <div className="h-14 animate-pulse rounded-md bg-card" />
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[9.375rem] animate-pulse rounded-lg bg-card" />
        ))}
      </div>
      <div className="grid gap-2.5 xl:grid-cols-[1fr_2fr]">
        <div className="h-[36.875rem] animate-pulse rounded-lg bg-card" />
        <div className="h-[36.875rem] animate-pulse rounded-lg bg-card" />
      </div>
      <p className="text-center text-sm text-muted-foreground">Loading positions from Meteora…</p>
    </div>
  );
}
