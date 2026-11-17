import { createFileRoute } from "@tanstack/react-router";
import { systemQuery } from "@/features/admin/admin.queries";
import { SystemPage } from "@/features/admin/components/system-page";

export const Route = createFileRoute("/admin/system")({
  loader: ({ context }) => context.queryClient.ensureQueryData(systemQuery),
  component: SystemPage,
});
