import { createFileRoute } from "@tanstack/react-router";
import { PoolFilter } from "@vexis/db/screen";
import { z } from "zod";
import { WIZARD_STEPS } from "@/features/agents/agents";
import { agentsQuery, telegramQuery, walletQuery } from "@/features/agents/agents.queries";
import { AgentWizard } from "@/features/agents/components/agent-wizard";
import { AgentPageSkeleton } from "@/features/agents/components/agents-skeleton";
import { screenerQuery } from "@/features/screener/screener.queries";

const NewAgentSearch = z.object({
  step: z.enum(WIZARD_STEPS).default("agent").catch("agent"),
  /** A custom screener filter from the screener's "Alert on pools like these". */
  custom: PoolFilter.optional().catch(undefined),
});

export const Route = createFileRoute("/agents/new")({
  validateSearch: NewAgentSearch,
  loader: async ({ context }) => {
    void context.queryClient.prefetchQuery(telegramQuery);
    void context.queryClient.prefetchQuery(screenerQuery);
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
  const { step, custom } = Route.useSearch();
  return <AgentWizard step={step} custom={custom ?? null} />;
}
