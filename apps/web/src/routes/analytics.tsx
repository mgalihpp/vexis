import { createFileRoute } from "@tanstack/react-router";
import { ChartNoAxesCombinedIcon } from "lucide-react";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics · Vexis" }] }),
  component: Analytics,
});

function Analytics() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 pt-24 text-center">
      <ChartNoAxesCombinedIcon className="size-12 text-brand" />
      <h1 className="mt-5 text-2xl font-semibold">Analytics</h1>
      <p className="mt-2 text-[0.9375rem] text-muted-foreground">Not built yet.</p>
    </div>
  );
}
