import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { pricesQuery } from "@/features/portfolio/portfolio.queries";
import { SCREENER_DEFAULTS, ScreenerPage } from "@/features/screener/components/screener-page";
import { ScreenerSkeleton } from "@/features/screener/components/screener-skeleton";
import { SORT_KEYS, TVL_STEPS, VOLUME_STEPS } from "@/features/screener/screener";
import { screenerQuery } from "@/features/screener/screener.queries";

const d = SCREENER_DEFAULTS;
const oneOf = (steps: readonly number[], fallback: number) =>
  z
    .number()
    .refine((n) => steps.includes(n))
    .default(fallback)
    .catch(fallback);

const ScreenerSearch = z.object({
  sort: z.enum(SORT_KEYS).default(d.sort).catch(d.sort),
  dir: z.enum(["asc", "desc"]).default(d.dir).catch(d.dir),
  tvl: oneOf(TVL_STEPS, d.tvl),
  vol: oneOf(VOLUME_STEPS, d.vol),
  step: z.enum(["all", "tight", "medium", "wide"]).default(d.step).catch(d.step),
  q: z.string().max(44).default(d.q).catch(d.q),
  bl: z.boolean().default(d.bl).catch(d.bl),
});

export const Route = createFileRoute("/screener")({
  validateSearch: ScreenerSearch,
  search: { middlewares: [stripSearchParams(d)] },
  loader: ({ context }) => context.queryClient.ensureQueryData(screenerQuery),
  head: () => ({ meta: [{ title: "Screener | Vexis" }] }),
  pendingComponent: ScreenerSkeleton,
  component: ScreenerRoute,
});

function ScreenerRoute() {
  const view = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(screenerQuery);
  const { data: prices } = useSuspenseQuery(pricesQuery);
  return (
    <ScreenerPage
      data={data}
      solPrice={prices.sol}
      view={view}
      onView={(patch) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })}
    />
  );
}
