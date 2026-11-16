import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { BriefcaseIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { describeFilter, type PoolFilter } from "@/features/agents/agents";
import { FormError } from "@/features/agents/components/agent-ui";
import { useOfficeMutation } from "@/features/office/components/office-ui";
import { saveScreenFn } from "@/features/office/office.functions";
import { officeEnabledQuery } from "@/features/office/office.queries";

/** "Scout pools like these": the screener's bounds become the office's custom pool filter. Only for an office owner. */
export function OfficeButton({ filter }: { filter: PoolFilter }) {
  const navigate = useNavigate();
  const { data: enabled } = useQuery(officeEnabledQuery);
  const save = useOfficeMutation(saveScreenFn);
  const [confirming, setConfirming] = useState(false);
  if (!enabled) return null;

  return (
    <>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={save.isPending}
        onClick={() => setConfirming(true)}
        aria-label="Scout pools like these"
        title="Scout pools like these"
      >
        {save.isPending ? <Spinner /> : <BriefcaseIcon />}
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scout pools like these?</AlertDialogTitle>
            <AlertDialogDescription>
              Your office's Scout reads every screener pool with {describeFilter(filter)}, minus blacklisted and
              freezable tokens, and its Risk Manager vetoes any other. You can switch back to a preset in the office
              settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <FormError error={save.error} />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                save.mutate(
                  { data: { preset: "custom", custom: filter } },
                  {
                    onSuccess: () => {
                      setConfirming(false);
                      toast.success("Office switched to this filter");
                      navigate({ to: "/office" });
                    },
                  },
                );
              }}
            >
              Switch the office
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
