import { createFileRoute } from "@tanstack/react-router";
import { heartbeatsQuery } from "@/features/admin/admin.queries";
import { HeartbeatPage } from "@/features/admin/components/heartbeat-page";

export const Route = createFileRoute("/admin")({
  loader: ({ context }) => context.queryClient.ensureQueryData(heartbeatsQuery),
  head: () => ({ meta: [{ title: "Admin | Vexis" }] }),
  component: HeartbeatPage,
});
