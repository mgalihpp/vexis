import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { invitesQuery } from "@/features/admin/admin.queries";
import { InviteSearch, SEARCH_DEFAULTS } from "@/features/admin/admin.search";
import { InvitesPage } from "@/features/admin/components/invites-page";

export const Route = createFileRoute("/admin/invites")({
  validateSearch: InviteSearch,
  search: { middlewares: [stripSearchParams(SEARCH_DEFAULTS)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(invitesQuery({ filter: deps.filter, q: deps.q || undefined, page: deps.page })),
  component: () => <InvitesPage search={Route.useSearch()} />,
});
