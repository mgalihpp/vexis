import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { type OfficeAgent, OPEN_STATUSES } from "@vexis/shared/office";
import {
  Building2Icon,
  OctagonPauseIcon,
  PlayIcon,
  SlidersHorizontalIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import { AgentsBar, BarPill } from "@/features/agents/components/agent-layout";
import { FormError } from "@/features/agents/components/agent-ui";
import { pricesQuery } from "@/features/portfolio/portfolio.queries";
import { bubbles, deskStatuses, type OfficeView, pauseView } from "../office";
import { killSwitchFn, resumeOfficeFn } from "../office.functions";
import { type FeedFilter, officeQuery } from "../office.queries";
import { AgentCard } from "./agent-card";
import { ApprovalPanel } from "./approval-panel";
import { createSound } from "./floor/sound";
import { OfficeFloor } from "./office-floor";
import { OfficeLog } from "./office-log";
import { OfficeSettings } from "./office-settings";
import { PnlCard, PositionsCard, SpendCard } from "./office-summary";
import { useNow, useOfficeMutation, utcClock } from "./office-ui";

type SideTab = "overview" | "approval" | "log";

const SIDE_TABS: { value: SideTab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "approval", label: "Approval" },
  { value: "log", label: "Log" },
];

// The same underline tabs as Portfolio and the agent pages.
const tabClass =
  "relative shrink-0 whitespace-nowrap px-3 py-2 text-xs font-medium text-muted-foreground/70 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5";

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
          <EmptyDescription>It is invite-only while in testing. Ask a Vexis admin to turn it on.</EmptyDescription>
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
  const [focus, setFocus] = useState<OfficeAgent>("manager");
  const [cardOpen, setCardOpen] = useState(false);
  const selected = cardOpen ? focus : null;
  const onSelect = useCallback((agent: OfficeAgent | null) => {
    if (agent) setFocus(agent);
    setCardOpen(agent !== null);
  }, []);
  const [follow, setFollow] = useState(false);
  const [settings, setSettings] = useState(false);
  const [sound] = useState(createSound);
  const [soundOn, setSoundOn] = useState(false);
  const [tab, setTab] = useState<SideTab>(() =>
    view.proposals.some((p) => p.status === "awaiting_approval") ? "approval" : "overview",
  );
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
    <div className="flex flex-col lg:h-full">
      <AgentsBar
        actions={
          <>
            <Button
              variant="outline"
              size="icon-sm"
              aria-pressed={soundOn}
              aria-label={soundOn ? "Mute sounds" : "Play sounds"}
              title={soundOn ? "Mute sounds" : "Play sounds"}
              onClick={() => setSoundOn(sound.enable(!soundOn) && !soundOn)}
            >
              {soundOn ? <Volume2Icon /> : <VolumeXIcon />}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSettings(true)}>
              <SlidersHorizontalIcon />
              Settings
            </Button>
            <StopControl view={view} now={now} />
          </>
        }
      >
        <BarPill icon={<Building2Icon className="size-[0.9rem] text-brand" />}>Office</BarPill>
      </AgentsBar>

      <div className="flex flex-col gap-3 p-4 lg:min-h-0 lg:flex-1">
        {pause.state === "paused" && (
          <Alert variant="destructive">
            <OctagonPauseIcon />
            <AlertTitle>Office paused</AlertTitle>
            <AlertDescription>
              {pause.text}
              {pause.until !== null && ` It lifts at ${utcClock(pause.until).slice(0, 5)} UTC.`}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)]">
          <div className="min-w-0 lg:h-full">
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
              live={view.config.live}
              bubbles={bubbles(view.messages, now)}
              messages={view.messages}
              selected={selected}
              focus={focus}
              onSelect={onSelect}
              follow={follow}
              onFollow={setFollow}
              now={now}
              onNewMessages={onNewMessages}
              card={
                <AgentCard
                  agent={focus}
                  view={view}
                  status={statuses[focus]}
                  stopped={stopped}
                  now={now}
                  following={follow}
                  onFollow={() => setFollow(!follow)}
                  onShowLog={() => {
                    onFilter({ ...filter, agent: focus });
                    setCardOpen(false);
                    setTab("log");
                  }}
                />
              }
            />
          </div>
          <div className="flex min-w-0 flex-col lg:h-full lg:min-h-0">
            <nav aria-label="Office panels" className="flex shrink-0 overflow-x-auto border-b px-2">
              {SIDE_TABS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-current={t.value === tab ? "page" : undefined}
                  onClick={() => setTab(t.value)}
                  className={`${tabClass} hover:text-muted-foreground ${t.value === tab ? "text-foreground! after:bg-brand" : ""}`}
                >
                  {t.label}
                  {t.value === "approval" && awaiting.length > 0 && (
                    <span className="ml-1 text-brand tabular-nums">{awaiting.length}</span>
                  )}
                </button>
              ))}
            </nav>
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pt-3 pr-1 [scrollbar-gutter:stable] lg:flex-1">
              {tab === "overview" && (
                <>
                  <PnlCard view={view} />
                  <PositionsCard view={view} now={now} />
                  <SpendCard view={view} />
                </>
              )}
              {tab === "approval" && <ApprovalPanel view={view} now={now} stopped={stopped} />}
              {tab === "log" && <OfficeLog view={view} filter={filter} onFilter={onFilter} />}
            </div>
          </div>
        </div>
      </div>

      <OfficeSettings config={view.config} open={settings} onOpenChange={setSettings} />
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
        <Button size="sm" disabled={resume.isPending} onClick={() => resume.mutate(undefined)}>
          {resume.isPending ? <Spinner /> : <PlayIcon />}
          Resume
        </Button>
        <FormError error={resume.error} />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end">
      <Button variant="destructive" size="sm" disabled={kill.isPending} onClick={() => setConfirming(true)}>
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
