import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { WIZARD_STEPS } from "@/features/agents/agents";
import { agentsQuery, telegramQuery, walletQuery } from "@/features/agents/agents.queries";
import { AgentWizard } from "@/features/agents/components/agent-wizard";
import { AgentPageSkeleton } from "@/features/agents/components/agents-skeleton";

const NewAgentSearch = z.object({
  step: z.enum(WIZARD_STEPS).default("agent").catch("agent"),
});

export const Route = createFileRoute("/agents/new")({
  validateSearch: NewAgentSearch,
  loader: async ({ context }) => {
    void context.queryClient.prefetchQuery(telegramQuery);
    await Promise.all([
      context.queryClient.ensureQueryData(agentsQuery),
      context.queryClient.ensureQueryData(walletQuery),
    ]);
  },
  head: () => ({ meta: [{ title: "New agent | Vexis" }] }),
  pendingComponent: AgentPageSkeleton,
  component: NewAgent,
});

function NewAgent() {
  const { step } = Route.useSearch();
  return <AgentWizard step={step} />;
}
