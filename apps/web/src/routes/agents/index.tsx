import { createFileRoute } from "@tanstack/react-router";
import { agentsQuery } from "@/features/agents/agents.queries";
import { FleetPage } from "@/features/agents/components/fleet-page";

export const Route = createFileRoute("/agents/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(agentsQuery),
  head: () => ({ meta: [{ title: "Agents | Vexis" }] }),
  component: FleetPage,
});
