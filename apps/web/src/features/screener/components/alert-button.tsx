import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BellIcon } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { describeFilter, type PoolFilter, presetLabel, screenerPreset } from "@/features/agents/agents";
import { alertOnFilterFn } from "@/features/agents/agents.functions";
import { agentsQuery } from "@/features/agents/agents.queries";
import { FormError, useAgentMutation } from "@/features/agents/components/agent-ui";

/**
 * "Alert on pools like these": the screener's bounds become a custom volume-spike filter. The user's volume spike
 * agent switches to it after a confirmation; a user without one starts the wizard on it.
 */
export function AlertButton({ filter }: { filter: PoolFilter }) {
  const navigate = useNavigate();
  const { data } = useQuery(agentsQuery);
  const save = useAgentMutation(alertOnFilterFn);
  const [confirming, setConfirming] = useState(false);
  const agent = data?.agents.find((a) => a.kind === "volume-watch");
  const preset = agent && screenerPreset(agent);
  const watching = !agent ? null : preset ? `the ${presetLabel(preset)} screener filter` : "its hand-picked pools";

  const start = () => {
    if (agent) return setConfirming(true);
    navigate({ to: "/agents/new", search: { step: "pools", custom: filter } });
  };

  return (
    <>
      <Button variant="outline" size="sm" disabled={!data || save.isPending} onClick={start}>
        {save.isPending ? <Spinner /> : <BellIcon />}
        Alert on pools like these
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alert on pools like these?</AlertDialogTitle>
            <AlertDialogDescription>
              Your volume spike agent stops watching {watching} and watches every screener pool with{" "}
              {describeFilter(filter)}, minus blacklisted and freezable tokens. Its hand-picked pools are kept, so you
              can switch back in its settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormError error={save.error} />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                save.mutate(
                  { data: { custom: filter } },
                  {
                    onSuccess: ({ id }) => {
                      setConfirming(false);
                      navigate({ to: "/agents/$agentId", params: { agentId: id }, search: { tab: "pools" } });
                    },
                  },
                );
              }}
            >
              Switch the agent
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
