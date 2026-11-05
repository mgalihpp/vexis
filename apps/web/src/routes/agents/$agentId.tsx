import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { agentsQuery, alertsQuery, telegramQuery } from "@/features/agents/agents.queries";
import { AgentDetail, DETAIL_TABS } from "@/features/agents/components/agent-detail";
import { AgentPageSkeleton } from "@/features/agents/components/agents-skeleton";

const DetailSearch = z.object({
  tab: z.enum(DETAIL_TABS).default("overview").catch("overview"),
});

export const Route = createFileRoute("/agents/$agentId")({
  validateSearch: DetailSearch,
  loader: async ({ context }) => {
    // The alert history and the Telegram state fill their own tabs; only the agent itself blocks the page.
    void context.queryClient.prefetchQuery(alertsQuery);
    void context.queryClient.prefetchQuery(telegramQuery);
    await context.queryClient.ensureQueryData(agentsQuery);
  },
  head: () => ({ meta: [{ title: "Agent | Vexis" }] }),
  pendingComponent: AgentPageSkeleton,
  component: Detail,
});

function Detail() {
  const { agentId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <AgentDetail id={agentId} tab={tab} />;
}
