import { createFileRoute } from "@tanstack/react-router";
import { ChartNoAxesCombinedIcon } from "lucide-react";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics · Vexis" }] }),
  component: Analytics,
});

function Analytics() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-3.25 pt-19.25 text-center">
      <ChartNoAxesCombinedIcon className="size-9.5 text-brand" />
      <h1 className="mt-4 text-xl font-semibold">Analytics</h1>
      <p className="mt-1.5 text-xs text-muted-foreground">Not built yet.</p>
    </div>
  );
}
