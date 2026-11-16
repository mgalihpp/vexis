import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { OFFICE_AGENTS } from "@vexis/db/office";
import { z } from "zod";
import { telegramQuery } from "@/features/agents/agents.queries";
import { PoolAddress } from "@/features/analytics/analytics.functions";
import { OfficePage } from "@/features/office/components/office-page";
import { OfficeSkeleton } from "@/features/office/components/office-skeleton";
import { officeFeedQuery, officeQuery } from "@/features/office/office.queries";

const OfficeSearch = z.object({
  agent: z.enum(OFFICE_AGENTS).optional().catch(undefined),
  pool: PoolAddress.optional().catch(undefined),
});

export const Route = createFileRoute("/office")({
  validateSearch: OfficeSearch,
  search: { middlewares: [stripSearchParams({ agent: undefined, pool: undefined })] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => {
    if (deps.agent || deps.pool) void context.queryClient.prefetchQuery(officeFeedQuery(deps));
    void context.queryClient.prefetchQuery(telegramQuery);
    return context.queryClient.ensureQueryData(officeQuery);
  },
  head: () => ({ meta: [{ title: "Office | Vexis" }] }),
  pendingComponent: OfficeSkeleton,
  component: OfficeRoute,
});

function OfficeRoute() {
  const filter = Route.useSearch();
  const navigate = Route.useNavigate();
  return <OfficePage filter={filter} onFilter={(next) => navigate({ search: next, replace: true })} />;
}
