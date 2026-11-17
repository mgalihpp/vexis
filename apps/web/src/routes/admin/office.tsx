import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { officesQuery } from "@/features/admin/admin.queries";
import { OFFICE_DEFAULTS, OfficeSearch } from "@/features/admin/admin.search";
import { OfficesPage } from "@/features/admin/components/offices-page";

export const Route = createFileRoute("/admin/office")({
  validateSearch: OfficeSearch,
  search: { middlewares: [stripSearchParams(OFFICE_DEFAULTS)] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(officesQuery({ filter: deps.filter, q: deps.q || undefined })),
  component: () => <OfficesPage search={Route.useSearch()} />,
});
