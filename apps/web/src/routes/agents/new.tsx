import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { WIZARD_STEPS } from "@/features/agents/agents";
import { AgentWizard } from "@/features/agents/components/agent-wizard";

const NewAgentSearch = z.object({
  step: z.enum(WIZARD_STEPS).default("strategy").catch("strategy"),
});

export const Route = createFileRoute("/agents/new")({
  validateSearch: NewAgentSearch,
  head: () => ({ meta: [{ title: "New agent | Vexis" }] }),
  component: NewAgent,
});

function NewAgent() {
  const { step } = Route.useSearch();
  return <AgentWizard step={step} />;
}
