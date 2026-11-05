import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AgentDetail, DETAIL_TABS } from "@/features/agents/components/agent-detail";

const DetailSearch = z.object({
  tab: z.enum(DETAIL_TABS).default("overview").catch("overview"),
});

export const Route = createFileRoute("/agents/$agentId")({
  validateSearch: DetailSearch,
  head: () => ({ meta: [{ title: "Agent | Vexis" }] }),
  component: Detail,
});

function Detail() {
  const { agentId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <AgentDetail id={agentId} tab={tab} />;
}
