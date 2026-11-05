import { createFileRoute } from "@tanstack/react-router";
import { FleetPage } from "@/features/agents/components/fleet-page";

export const Route = createFileRoute("/agents/")({
  head: () => ({ meta: [{ title: "Agents | Vexis" }] }),
  component: FleetPage,
});
