import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { WIZARD_STEPS } from "@/features/agents/agents";
import { agentsQuery, telegramQuery } from "@/features/agents/agents.queries";
import { AgentWizard } from "@/features/agents/components/agent-wizard";

const NewAgentSearch = z.object({
  step: z.enum(WIZARD_STEPS).default("pools").catch("pools"),
});

export const Route = createFileRoute("/agents/new")({
  validateSearch: NewAgentSearch,
  loader: async ({ context }) => {
    void context.queryClient.prefetchQuery(telegramQuery);
    // One volume alert per user: if it exists, manage it instead of making another.
    const { agents } = await context.queryClient.ensureQueryData(agentsQuery);
    const existing = agents[0];
    if (existing)
      throw redirect({ to: "/agents/$agentId", params: { agentId: existing.id }, search: { tab: "overview" } });
  },
  head: () => ({ meta: [{ title: "New agent | Vexis" }] }),
  component: NewAgent,
});

function NewAgent() {
  const { step } = Route.useSearch();
  return <AgentWizard step={step} />;
}
