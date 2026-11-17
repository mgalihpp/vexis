import { createFileRoute } from "@tanstack/react-router";
import { agentsQuery } from "@/features/admin/admin.queries";
import { AgentsPage } from "@/features/admin/components/agents-page";

export const Route = createFileRoute("/admin/agents")({
  loader: ({ context }) => context.queryClient.ensureQueryData(agentsQuery),
  component: AgentsPage,
});
