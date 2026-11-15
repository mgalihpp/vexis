import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { type OfficeAgent, OPEN_STATUSES } from "@vexis/db/office";
import { Building2Icon, PlayIcon, SettingsIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { FormError } from "@/features/agents/components/agent-ui";
import { pricesQuery } from "@/features/portfolio/portfolio.queries";
import { bubbles, deskStatuses, type OfficeView, pauseView } from "../office";
import { killSwitchFn, resumeOfficeFn } from "../office.functions";
import { type FeedFilter, officeQuery } from "../office.queries";
import { AgentInspector } from "./agent-inspector";
import { ApprovalPanel } from "./approval-panel";
import { createSound } from "./floor/sound";
import { OfficeFloor } from "./office-floor";
import { OfficeLog } from "./office-log";
import { OfficeSettings } from "./office-settings";
import { OfficeStats, PositionsCard, SpendCard } from "./office-summary";
import { useNow, useOfficeMutation, utcClock } from "./office-ui";

export function OfficePage({ filter, onFilter }: { filter: FeedFilter; onFilter: (next: FeedFilter) => void }) {
  const { data } = useSuspenseQuery(officeQuery);
  if (!data.enabled) return <NoOffice />;
  return <Office view={data} filter={filter} onFilter={onFilter} />;
}

function NoOffice() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Building2Icon />
          </EmptyMedia>
          <EmptyTitle>The office is not enabled yet</EmptyTitle>
          <EmptyDescription>
            The agent office runs on invitation while it is in testing. A Vexis admin enables it for your account; once
            they do, your seven agents show up here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

function Office({
  view,
  filter,
  onFilter,
}: {
  view: OfficeView;
  filter: FeedFilter;
  onFilter: (next: FeedFilter) => void;
}) {
  const now = useNow(view.now);
  const { data: prices } = useQuery(pricesQuery);
  const [selected, setSelected] = useState<OfficeAgent>("manager");
  const [follow, setFollow] = useState(false);
  const [settings, setSettings] = useState(false);
  const [sound] = useState(createSound);
  const [soundOn, setSoundOn] = useState(false);
  const pause = pauseView(view.config, now);
  const stopped = pause.state === "paused";
  const statuses = deskStatuses(view, now);
  const awaiting = view.proposals.filter((p) => p.status === "awaiting_approval");
  const onNewMessages = useCallback(() => {
    if (soundOn) sound.play("message");
  }, [sound, soundOn]);
  const waitingIds = awaiting.map((p) => p.id).join(",");
  const heard = useRef<string[] | null>(null);
  useEffect(() => {
    const ids = waitingIds ? waitingIds.split(",") : [];
    if (soundOn && heard.current && ids.some((id) => !heard.current?.includes(id))) sound.play("approval");
    heard.current = ids;
  }, [waitingIds, sound, soundOn]);

  return (
    <div className="mx-auto flex max-w-[1480px] flex-col gap-3 px-4 pt-4 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Agent office</h1>
          <p className="mt-0.5 max-w-[62ch] text-xs text-muted-foreground">
            Seven agents work the DLMM loop on one floor. Proposals that pass the guardrails wait for your approval on
            the right. This is a simulation: nothing is signed on-chain.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <fieldset className="m-0 flex gap-0.5 rounded-lg border-0 bg-muted p-0.5">
            <legend className="sr-only">Mode</legend>
            <button
              type="button"
              aria-pressed="true"
              className="h-7 rounded-md bg-background px-2.5 text-xs font-medium shadow-sm"
            >
              Approval
            </button>
            <button
              type="button"
              disabled
              title="Autopilot comes in V2"
              className="h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground opacity-60"
            >
              Autopilot <span className="text-[0.6rem] font-bold tracking-wider text-brand">V2</span>
            </button>
          </fieldset>
          <Button
            variant="outline"
            aria-pressed={soundOn}
            onClick={() => setSoundOn(sound.enable(!soundOn) && !soundOn)}
          >
            {soundOn ? <Volume2Icon /> : <VolumeXIcon />}
            Sound
          </Button>
          <Button variant="outline" onClick={() => setSettings(true)}>
            <SettingsIcon />
            Settings
          </Button>
          <StopControl view={view} now={now} />
        </div>
      </div>

      {pause.state === "paused" && (
        <div role="status" className="rounded-lg border border-loss/40 bg-loss/10 px-3.5 py-2.5 text-xs text-loss">
          {pause.text}
          {pause.until !== null && ` It lifts at ${utcClock(pause.until).slice(0, 5)} UTC.`}
        </div>
      )}

      <OfficeStats view={view} />

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <OfficeFloor
            data={{
              statuses,
              stopped,
              board: {
                cards: view.proposals.filter((p) => OPEN_STATUSES.includes(p.status)).length,
                hot: awaiting.length > 0,
              },
              positions: view.positions.length,
              executing: view.proposals.some((p) => p.status === "executing"),
              solUsd: prices?.sol ?? null,
            }}
            statuses={statuses}
            bubbles={bubbles(view.messages, now)}
            messages={view.messages}
            selected={selected}
            onSelect={setSelected}
            follow={follow}
            onFollow={setFollow}
            now={now}
            onNewMessages={onNewMessages}
          />
        </div>
        <aside className="flex min-w-0 flex-col gap-3 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <ApprovalPanel view={view} now={now} stopped={stopped} />
          <AgentInspector agent={selected} view={view} status={statuses[selected]} stopped={stopped} />
          <OfficeLog view={view} filter={filter} onFilter={onFilter} />
        </aside>
        <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:col-start-1">
          <PositionsCard view={view} now={now} />
          <SpendCard view={view} />
        </div>
      </div>

      <Sheet open={settings} onOpenChange={setSettings}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Office settings</SheetTitle>
            <SheetDescription>Models, keys, wallet and guardrails for your office.</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            <OfficeSettings config={view.config} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/** The kill switch, or Resume while a pause the owner may lift is on. An admin stop offers neither. */
function StopControl({ view, now }: { view: OfficeView; now: number }) {
  const [confirming, setConfirming] = useState(false);
  const kill = useOfficeMutation(killSwitchFn);
  const resume = useOfficeMutation(resumeOfficeFn);
  const pause = pauseView(view.config, now);
  if (pause.state === "paused") {
    if (!pause.canResume) return null;
    return (
      <div className="flex flex-col items-end">
        <Button disabled={resume.isPending} onClick={() => resume.mutate(undefined)}>
          {resume.isPending ? <Spinner /> : <PlayIcon />}
          Resume
        </Button>
        <FormError error={resume.error} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end">
      <Button variant="destructive" disabled={kill.isPending} onClick={() => setConfirming(true)}>
        {kill.isPending && <Spinner />}
        Kill switch
      </Button>
      <FormError error={kill.error} />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop the office?</AlertDialogTitle>
            <AlertDialogDescription>
              Every agent stops, and every proposal that has not started executing is rejected. You can resume the
              office afterwards; rejected proposals stay rejected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => kill.mutate(undefined)}>
              Stop the office
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
