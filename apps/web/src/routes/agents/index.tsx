import { createFileRoute } from "@tanstack/react-router";
import { agentsQuery } from "@/features/agents/agents.queries";
import { FleetSkeleton } from "@/features/agents/components/agents-skeleton";
import { FleetPage } from "@/features/agents/components/fleet-page";

export const Route = createFileRoute("/agents/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(agentsQuery),
  head: () => ({ meta: [{ title: "Agents | Vexis" }] }),
  pendingComponent: FleetSkeleton,
  component: FleetPage,
});
