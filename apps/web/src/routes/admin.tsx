import { createFileRoute, notFound } from "@tanstack/react-router";
import { countsQuery } from "@/features/admin/admin.queries";
import { AdminLayout } from "@/features/admin/components/admin-layout";

// The role check here only steers the UI. Every admin server function checks the role in the database again.
export const Route = createFileRoute("/admin")({
  beforeLoad: ({ context }) => {
    if (context.viewer?.role !== "admin") throw notFound();
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(countsQuery),
  head: () => ({ meta: [{ title: "Admin | Vexis" }] }),
  component: AdminLayout,
});
