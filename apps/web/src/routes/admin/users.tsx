import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { usersQuery } from "@/features/admin/admin.queries";
import { SEARCH_DEFAULTS, UserSearch } from "@/features/admin/admin.search";
import { UsersPage } from "@/features/admin/components/users-page";

export const Route = createFileRoute("/admin/users")({
  validateSearch: UserSearch,
  search: { middlewares: [stripSearchParams(SEARCH_DEFAULTS)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(usersQuery({ filter: deps.filter, q: deps.q || undefined, page: deps.page })),
  component: () => <UsersPage search={Route.useSearch()} />,
});
